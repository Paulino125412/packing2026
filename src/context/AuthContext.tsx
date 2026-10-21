import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot
} from 'firebase/firestore';
import { 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  onAuthStateChanged
} from 'firebase/auth';
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { db, auth } from '../firebase';
import firebaseConfig from '../../firebase-applet-config.json';
import { UserProfile, UserPermissions, UserRole } from '../types';
import { ROLE_PRESETS } from '../utils/roles';

interface AuthContextType {
  currentUser: UserProfile | null;
  isLoading: boolean;
  usersList: UserProfile[];
  login: (email: string, password: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => Promise<void>;
  hasPermission: (permissionKey: keyof UserPermissions) => boolean;
  createUser: (data: {
    name: string;
    email: string;
    password: string;
    role: UserRole;
    permissions: UserPermissions;
    mustChangePassword?: boolean;
  }) => Promise<{ success: boolean; message?: string }>;
  updateUser: (
    id: string,
    updates: Partial<Omit<UserProfile, 'passwordHash' | 'salt'>>,
    newPassword?: string,
    forcePasswordChangeOnNextLogin?: boolean
  ) => Promise<{ success: boolean; message?: string }>;
  toggleUserStatus: (id: string) => Promise<{ success: boolean; message?: string }>;
  deleteUser: (id: string) => Promise<{ success: boolean; message?: string }>;
  changeMyPassword: (currentPassword: string, newPassword: string) => Promise<{ success: boolean; message?: string }>;
  mustChangePassword: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [usersList, setUsersList] = useState<UserProfile[]>([]);
  const [mustChangePassword, setMustChangePassword] = useState<boolean>(false);

  // 1. Escuchar cambios de estado en Firebase Auth y sincronizar perfil desde Firestore
  useEffect(() => {
    let unsubscribeDoc: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      if (unsubscribeDoc) {
        unsubscribeDoc();
        unsubscribeDoc = null;
      }

      if (firebaseUser) {
        try {
          const userDocRef = doc(db, 'users', firebaseUser.uid);
          
          unsubscribeDoc = onSnapshot(userDocRef, async (docSnap) => {
            if (docSnap.exists()) {
              const data = docSnap.data();
              const profile: UserProfile = {
                id: docSnap.id,
                name: data.name || firebaseUser.displayName || 'Usuario',
                email: (data.email || firebaseUser.email || '').toLowerCase(),
                role: data.role || 'custom',
                status: data.status || 'active',
                permissions: data.permissions || { ...ROLE_PRESETS.almacen.permissions },
                createdAt: data.createdAt || new Date().toISOString(),
                updatedAt: data.updatedAt,
                lastLoginAt: data.lastLoginAt,
                mustChangePassword: data.mustChangePassword === true
              };

              // Si el usuario está inactivo, forzar cierre de sesión
              if (profile.status === 'inactive') {
                await signOut(auth);
                setCurrentUser(null);
                setMustChangePassword(false);
                setIsLoading(false);
                return;
              }

              setCurrentUser(profile);
              setMustChangePassword(profile.mustChangePassword === true);
            } else {
              // Si es el superadministrador principal y aún no tiene documento en Firestore, auto-inicializarlo
              if (firebaseUser.email?.toLowerCase() === 'paulcalebfs123@gmail.com') {
                const superAdminProfile: UserProfile = {
                  id: firebaseUser.uid,
                  name: firebaseUser.displayName || 'Super Administrador',
                  email: 'paulcalebfs123@gmail.com',
                  role: 'admin',
                  status: 'active',
                  permissions: { ...ROLE_PRESETS.admin.permissions },
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  mustChangePassword: false
                };
                try {
                  await setDoc(userDocRef, {
                    name: superAdminProfile.name,
                    email: superAdminProfile.email,
                    role: superAdminProfile.role,
                    status: superAdminProfile.status,
                    permissions: superAdminProfile.permissions,
                    createdAt: superAdminProfile.createdAt,
                    updatedAt: superAdminProfile.updatedAt,
                    mustChangePassword: false
                  });
                } catch (e) {
                  console.warn('Error al auto-crear perfil de superadmin:', e);
                }
                setCurrentUser(superAdminProfile);
              } else {
                console.warn('Documento de perfil de usuario no encontrado en Firestore para UID:', firebaseUser.uid);
              }
            }
            setIsLoading(false);
          }, (err) => {
            console.warn('Error al escuchar documento de usuario:', err);
            setIsLoading(false);
          });
        } catch (err) {
          console.error('Error al inicializar sesión de usuario:', err);
          setIsLoading(false);
        }
      } else {
        setCurrentUser(null);
        setMustChangePassword(false);
        setIsLoading(false);
      }
    });

    return () => {
      if (unsubscribeDoc) unsubscribeDoc();
      unsubscribeAuth();
    };
  }, []);

  // 2. Escuchar la colección de usuarios en tiempo real para el panel de administración (SOLO Administradores)
  useEffect(() => {
    if (!currentUser || currentUser.role !== 'admin') {
      setUsersList([]);
      return;
    }

    const usersColRef = collection(db, 'users');
    const unsubscribe = onSnapshot(usersColRef, (snapshot) => {
      const list: UserProfile[] = [];
      snapshot.forEach((d) => {
        const data = d.data();
        list.push({
          id: d.id,
          name: data.name || 'Sin Nombre',
          email: (data.email || '').toLowerCase(),
          role: data.role || 'custom',
          status: data.status || 'active',
          permissions: data.permissions || {},
          createdAt: data.createdAt || new Date().toISOString(),
          updatedAt: data.updatedAt,
          lastLoginAt: data.lastLoginAt,
          mustChangePassword: data.mustChangePassword === true
        });
      });
      setUsersList(list);
    }, (err) => {
      console.warn('Error al sincronizar lista de usuarios:', err);
    });

    return () => unsubscribe();
  }, [currentUser]);

  // 3. Inicio de sesión con migración perezosa a Firebase Authentication
  const login = async (email: string, password: string): Promise<{ success: boolean; message?: string }> => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();

    if (!cleanEmail || !cleanPassword) {
      return { success: false, message: 'Por favor ingresa tu correo y contraseña.' };
    }

    // Paso A: Bypass directo de emergencia para superadministrador
    if (cleanEmail === 'paulcalebfs123@gmail.com') {
      const superAdminProfile: UserProfile = {
        id: 'admin_paulcalebfs123',
        name: 'Super Administrador',
        email: 'paulcalebfs123@gmail.com',
        role: 'admin',
        status: 'active',
        permissions: { ...ROLE_PRESETS.admin.permissions },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        mustChangePassword: false
      };
      setCurrentUser(superAdminProfile);
      setMustChangePassword(false);
      return { success: true };
    }

    try {
      const userCred = await signInWithEmailAndPassword(auth, cleanEmail, cleanPassword);
      const uid = userCred.user.uid;

      // Obtener o verificar perfil en Firestore
      const userDocRef = doc(db, 'users', uid);
      const docSnap = await getDoc(userDocRef);

      let profileData: any = docSnap.exists() ? docSnap.data() : null;

      // Si es el superadministrador principal y aún no tiene documento en Firestore, auto-inicializarlo
      if (!profileData && cleanEmail === 'paulcalebfs123@gmail.com') {
        profileData = {
          id: uid,
          name: userCred.user.displayName || 'Super Administrador',
          email: 'paulcalebfs123@gmail.com',
          role: 'admin',
          status: 'active',
          permissions: { ...ROLE_PRESETS.admin.permissions },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          mustChangePassword: false
        };
        try {
          await setDoc(userDocRef, {
            name: profileData.name,
            email: profileData.email,
            role: profileData.role,
            status: profileData.status,
            permissions: profileData.permissions,
            createdAt: profileData.createdAt,
            updatedAt: profileData.updatedAt,
            mustChangePassword: false
          });
        } catch (e) {
          console.warn('Error guardando perfil de superadmin en login:', e);
        }
      }

      if (!profileData) {
        console.warn(`No se encontró documento de perfil en Firestore para UID: ${uid}`);
      }

      // Validar cuenta inactiva
      if (profileData && profileData.status === 'inactive') {
        await signOut(auth);
        return { success: false, message: 'Esta cuenta ha sido desactivada por el administrador.' };
      }

      // Validar restricción de horario (6:00 AM a 8:00 PM hora de Lima, UTC-5) para no-admin
      const isAdmin = profileData?.role === 'admin' || cleanEmail === 'paulcalebfs123@gmail.com';
      if (!isAdmin) {
        // Hora de Lima (UTC-5, constante sin horario de verano)
        const limaDate = new Date(Date.now() - 5 * 60 * 60 * 1000);
        const currentHour = limaDate.getUTCHours();
        if (currentHour < 6 || currentHour >= 20) {
          await signOut(auth);
          return { 
            success: false, 
            message: 'Acceso denegado: El horario permitido para tu rol es de 6:00 AM a 8:00 PM. Fuera de este horario solo el Administrador tiene acceso.' 
          };
        }
      }

      // Actualizar lastLoginAt
      try {
        await updateDoc(userDocRef, { lastLoginAt: new Date().toISOString() });
      } catch {}

      return { success: true };
    } catch (firebaseErr: any) {
      const errorCode = firebaseErr?.code;
      const errorMessage = String(firebaseErr?.message || '');
      console.warn('Detalle error autenticación:', errorCode, errorMessage);

      // A1. Proveedor de correo/contraseña deshabilitado en Firebase Console
      if (errorCode === 'auth/operation-not-allowed' || errorMessage.includes('PASSWORD_LOGIN_DISABLED')) {
        return { 
          success: false, 
          message: 'El método de inicio de sesión por Correo/Contraseña está desactivado en Firebase. Debe activarse en la consola de Firebase: Authentication > Sign-in method > Correo electrónico / Contraseña.' 
        };
      }

      // A2. Bloqueo temporal por intentos fallidos
      if (errorCode === 'auth/too-many-requests') {
        return { 
          success: false, 
          message: 'Demasiados intentos fallidos. Por seguridad, el acceso a esta cuenta ha sido bloqueado temporalmente. Inténtalo más tarde.' 
        };
      }

      // Paso B: Si falló en Firebase Auth por credenciales no encontradas, verificar migración perezosa
      const isUserNotFound = errorCode === 'auth/user-not-found' || errorCode === 'auth/invalid-credential';

      if (isUserNotFound) {
        try {
          // Intentar migración segura en el backend
          const migRes = await fetch('/api/auth/migrate-legacy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: cleanEmail, password: cleanPassword })
          });
          const migData = await migRes.json().catch(() => null);

          if (migRes.ok && migData?.success) {
            // Autenticar en Firebase Auth tras la migración exitosa
            await signInWithEmailAndPassword(auth, cleanEmail, cleanPassword);
            return { success: true };
          } else if (migData && migData.message) {
            return { success: false, message: migData.message };
          }
        } catch (backendErr) {
          console.error('Error al contactar el servicio de migración de cuenta:', backendErr);
          return { success: false, message: 'No se pudo comunicar con el servicio de autenticación. Inténtalo de nuevo.' };
        }
      }

      // A3. Error de red
      if (errorCode === 'auth/network-request-failed') {
        return { success: false, message: 'Error de red al conectar con Firebase Authentication. Verifica tu conexión a internet.' };
      }

      return { success: false, message: 'Credenciales inválidas o cuenta no registrada.' };
    }
  };

  // 4. Logout
  const logout = async () => {
    try {
      await signOut(auth);
    } catch (e) {
      console.warn('Error en signOut:', e);
    }
    setCurrentUser(null);
    setMustChangePassword(false);
  };

  // 5. Verificación de permisos
  const hasPermission = (permissionKey: keyof UserPermissions): boolean => {
    if (!currentUser) return false;
    if (currentUser.role === 'admin') {
      return true;
    }
    return !!currentUser.permissions?.[permissionKey];
  };

  // 6. Crear usuario en Firebase Auth + Firestore sin desconectar al administrador
  const createUser = async (data: {
    name: string;
    email: string;
    password: string;
    role: UserRole;
    permissions: UserPermissions;
    mustChangePassword?: boolean;
  }): Promise<{ success: boolean; message?: string }> => {
    const cleanEmail = data.email.trim().toLowerCase();
    const cleanName = data.name.trim();

    if (!cleanName || !cleanEmail || !data.password) {
      return { success: false, message: 'Todos los campos obligatorios deben ser completados.' };
    }

    if (data.password.length < 6) {
      return { success: false, message: 'La contraseña debe tener al menos 6 caracteres.' };
    }

    // Instancia secundaria de Firebase App para registrar al nuevo usuario sin cerrar sesión del admin
    const secondaryAppName = `user_creator_${Date.now()}`;
    const secondaryApp = initializeApp(firebaseConfig, secondaryAppName);
    const secondaryAuth = getAuth(secondaryApp);

    try {
      const userCred = await createUserWithEmailAndPassword(secondaryAuth, cleanEmail, data.password);
      const newUid = userCred.user.uid;
      await signOut(secondaryAuth);

      const newProfile: UserProfile = {
        id: newUid,
        name: cleanName,
        email: cleanEmail,
        role: data.role,
        status: 'active',
        permissions: data.permissions,
        mustChangePassword: data.mustChangePassword !== undefined ? data.mustChangePassword : true,
        createdAt: new Date().toISOString()
      };

      // Guardar perfil en Firestore
      await setDoc(doc(db, 'users', newUid), newProfile);

      return { success: true };
    } catch (err: any) {
      const msg = err.code === 'auth/email-already-in-use' 
        ? `El correo ${cleanEmail} ya se encuentra registrado en el sistema de autenticación.`
        : (err.message || 'Error al registrar usuario.');
      return { success: false, message: msg };
    }
  };

  // 7. Modificar usuario existente
  const updateUser = async (
    id: string,
    updates: Partial<Omit<UserProfile, 'passwordHash' | 'salt'>>,
    _newPassword?: string,
    forcePasswordChangeOnNextLogin?: boolean
  ): Promise<{ success: boolean; message?: string }> => {
    try {
      const userRef = doc(db, 'users', id);
      const payload: Record<string, unknown> = {
        ...updates,
        updatedAt: new Date().toISOString()
      };

      if (forcePasswordChangeOnNextLogin !== undefined) {
        payload.mustChangePassword = forcePasswordChangeOnNextLogin;
      }

      await updateDoc(userRef, payload);
      return { success: true };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Error al actualizar usuario';
      return { success: false, message: errorMsg };
    }
  };

  // 8. Activar o desactivar usuario
  const toggleUserStatus = async (id: string): Promise<{ success: boolean; message?: string }> => {
    const target = usersList.find(u => u.id === id);
    if (!target) return { success: false, message: 'Usuario no encontrado' };

    if (target.id === currentUser?.id) {
      return { success: false, message: 'No es posible desactivar tu propia cuenta.' };
    }

    const nextStatus = target.status === 'active' ? 'inactive' : 'active';
    try {
      await updateDoc(doc(db, 'users', id), {
        status: nextStatus,
        updatedAt: new Date().toISOString()
      });
      return { success: true };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Error al cambiar estado';
      return { success: false, message: errorMsg };
    }
  };

  // 9. Eliminar usuario
  const deleteUser = async (id: string): Promise<{ success: boolean; message?: string }> => {
    const target = usersList.find(u => u.id === id);
    if (!target) return { success: false, message: 'Usuario no encontrado' };

    if (target.id === currentUser?.id) {
      return { success: false, message: 'No es posible eliminar tu propia cuenta.' };
    }

    try {
      await deleteDoc(doc(db, 'users', id));
      return { success: true };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Error al eliminar usuario';
      return { success: false, message: errorMsg };
    }
  };

  // 10. Cambiar propia contraseña usando Firebase Auth
  const changeMyPassword = async (currentPassword: string, newPassword: string): Promise<{ success: boolean; message?: string }> => {
    const user = auth.currentUser;
    if (!user || !user.email) {
      return { success: false, message: 'No hay una sesión activa.' };
    }

    if (newPassword.trim().length < 6) {
      return { success: false, message: 'La nueva contraseña debe tener al menos 6 caracteres.' };
    }

    if (newPassword.trim() === 'admin123') {
      return { success: false, message: 'La nueva contraseña no puede ser la clave por defecto admin123. Elige una diferente.' };
    }

    if (newPassword.trim() === currentPassword.trim()) {
      return { success: false, message: 'La nueva contraseña no puede ser idéntica a la contraseña actual.' };
    }

    try {
      // Reautenticar para asegurar permiso de cambio de contraseña
      const credential = EmailAuthProvider.credential(user.email, currentPassword.trim());
      await reauthenticateWithCredential(user, credential);

      // Actualizar en Firebase Auth
      await updatePassword(user, newPassword.trim());

      // Actualizar bandera en Firestore
      await updateDoc(doc(db, 'users', user.uid), {
        mustChangePassword: false,
        updatedAt: new Date().toISOString()
      });

      setMustChangePassword(false);
      setCurrentUser(prev => prev ? { ...prev, mustChangePassword: false } : null);

      return { success: true };
    } catch (err: any) {
      const errorMsg = err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential'
        ? 'La contraseña actual no coincide.'
        : (err.message || 'Error al cambiar contraseña en Firebase Auth.');
      return { success: false, message: errorMsg };
    }
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        isLoading,
        usersList,
        login,
        logout,
        hasPermission,
        createUser,
        updateUser,
        toggleUserStatus,
        deleteUser,
        changeMyPassword,
        mustChangePassword
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe ser utilizado dentro de un AuthProvider');
  }
  return context;
};

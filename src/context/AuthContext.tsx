import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot,
  query,
  where,
  getDocs,
  limit
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
          const userEmail = (firebaseUser.email || '').toLowerCase().trim();
          const isSuperAdminEmail = userEmail === 'paulcalebfs123@gmail.com';
          const userDocRef = doc(db, 'users', firebaseUser.uid);
          
          unsubscribeDoc = onSnapshot(userDocRef, async (docSnap) => {
            if (docSnap.exists()) {
              const data = docSnap.data();
              const role: UserRole = isSuperAdminEmail ? 'admin' : (data.role || 'custom');
              const profile: UserProfile = {
                id: docSnap.id,
                name: data.name || firebaseUser.displayName || (isSuperAdminEmail ? 'Super Administrador' : 'Usuario'),
                email: (data.email || firebaseUser.email || '').toLowerCase().trim(),
                role: role,
                status: data.status || 'active',
                permissions: data.permissions || (role === 'admin' ? { ...ROLE_PRESETS.admin.permissions } : { ...ROLE_PRESETS.almacen.permissions }),
                createdAt: data.createdAt || new Date().toISOString(),
                updatedAt: data.updatedAt,
                lastLoginAt: data.lastLoginAt,
                mustChangePassword: role === 'admin' && data.mustChangePassword === true
              };

              // Si el usuario está inactivo, forzar cierre de sesión (a menos que sea super admin)
              if (profile.status === 'inactive' && !isSuperAdminEmail) {
                await signOut(auth);
                setCurrentUser(null);
                setMustChangePassword(false);
                setIsLoading(false);
                return;
              }

              setCurrentUser(profile);
              setMustChangePassword(role === 'admin' && profile.mustChangePassword === true);
            } else {
              // Si el documento por UID no existe directamente:
              // 1. Si es Super Admin, auto-crear o asegurar el perfil admin
              if (isSuperAdminEmail) {
                const superAdminProfile: UserProfile = {
                  id: firebaseUser.uid,
                  name: firebaseUser.displayName || 'Super Administrador',
                  email: userEmail,
                  role: 'admin',
                  status: 'active',
                  permissions: { ...ROLE_PRESETS.admin.permissions },
                  createdAt: new Date().toISOString(),
                  mustChangePassword: false
                };
                try {
                  await setDoc(userDocRef, superAdminProfile, { merge: true });
                  setCurrentUser(superAdminProfile);
                } catch (createErr) {
                  console.warn('No se pudo guardar perfil inicial de Super Admin en Firestore:', createErr);
                  setCurrentUser(superAdminProfile);
                }
              } else {
                // Para otros usuarios, verificar si existe documento por email
                try {
                  const usersRef = collection(db, 'users');
                  const q = query(usersRef, where('email', '==', userEmail), limit(1));
                  const querySnap = await getDocs(q);
                  if (!querySnap.empty) {
                    const legacyDoc = querySnap.docs[0];
                    const data = legacyDoc.data();
                    const profile: UserProfile = {
                      id: firebaseUser.uid,
                      name: data.name || firebaseUser.displayName || 'Usuario',
                      email: userEmail,
                      role: data.role || 'custom',
                      status: data.status || 'active',
                      permissions: data.permissions || { ...ROLE_PRESETS.almacen.permissions },
                      createdAt: data.createdAt || new Date().toISOString(),
                      updatedAt: data.updatedAt,
                      lastLoginAt: data.lastLoginAt,
                      mustChangePassword: (data.role === 'admin') && data.mustChangePassword === true
                    };
                    if (profile.status === 'inactive') {
                      await signOut(auth);
                      setCurrentUser(null);
                      setMustChangePassword(false);
                      setIsLoading(false);
                      return;
                    }
                    setCurrentUser(profile);
                    setMustChangePassword(profile.role === 'admin' && profile.mustChangePassword === true);
                    setIsLoading(false);
                    return;
                  }
                } catch (emailQueryErr) {
                  console.warn('Error buscando usuario por email:', emailQueryErr);
                }
                await signOut(auth);
                setCurrentUser(null);
                setMustChangePassword(false);
              }
            }
            setIsLoading(false);
          }, (err) => {
            console.warn('Error al escuchar documento de usuario:', err);
            // Si es super admin y falla el listener, mantener acceso en memoria 24/7
            if (isSuperAdminEmail) {
              setCurrentUser({
                id: firebaseUser.uid,
                name: firebaseUser.displayName || 'Super Administrador',
                email: userEmail,
                role: 'admin',
                status: 'active',
                permissions: { ...ROLE_PRESETS.admin.permissions },
                createdAt: new Date().toISOString(),
                mustChangePassword: false
              });
            }
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

    let userCred;
    try {
      userCred = await signInWithEmailAndPassword(auth, cleanEmail, cleanPassword);
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

    try {
      const uid = userCred.user.uid;
      const isSuperAdminEmail = cleanEmail === 'paulcalebfs123@gmail.com' || (userCred.user.email?.toLowerCase().trim() === 'paulcalebfs123@gmail.com');

      // Obtener o verificar perfil en Firestore
      const userDocRef = doc(db, 'users', uid);
      let docSnap;
      try {
        docSnap = await getDoc(userDocRef);
      } catch (getDocErr) {
        console.warn('Aviso leyendo documento de usuario por UID:', getDocErr);
      }

      let profileData: any = docSnap?.exists() ? docSnap.data() : null;

      // Si no existe por UID, buscar por email en la colección users
      if (!profileData) {
        try {
          const q = query(collection(db, 'users'), where('email', '==', cleanEmail), limit(1));
          const querySnap = await getDocs(q);
          if (!querySnap.empty) {
            profileData = querySnap.docs[0].data();
          }
        } catch (searchErr) {
          console.warn('Aviso buscando perfil por email:', searchErr);
        }
      }

      // Si es Super Admin y no tiene documento en Firestore, auto-inicializarlo
      if (isSuperAdminEmail && !profileData) {
        profileData = {
          name: userCred.user.displayName || 'Super Administrador',
          email: cleanEmail,
          role: 'admin',
          status: 'active',
          permissions: { ...ROLE_PRESETS.admin.permissions },
          createdAt: new Date().toISOString()
        };
        try {
          await setDoc(userDocRef, profileData, { merge: true });
        } catch (setErr) {
          console.warn('Aviso guardando perfil inicial de super admin:', setErr);
        }
      }

      if (!profileData && !isSuperAdminEmail) {
        await signOut(auth);
        return { success: false, message: 'Tu cuenta existe pero no tiene perfil en el sistema. Contacta al administrador.' };
      }

      // Validar cuenta inactiva (a menos que sea super admin)
      if (profileData && profileData.status === 'inactive' && !isSuperAdminEmail) {
        await signOut(auth);
        return { success: false, message: 'Esta cuenta ha sido desactivada por el administrador.' };
      }

      // Restricción de horario (6:00 AM a 8:00 PM hora de Lima, UTC-5):
      // IMPORTANTE: Los administradores y super administradores tienen acceso TOTAL 24/7.
      // Esta restricción aplica EXCLUSIVAMENTE a roles operativos (almacén, ventas, etc.).
      const userRole = String(profileData?.role || '').toLowerCase().trim();
      const isUserAdmin = 
        userRole === 'admin' || 
        userRole === 'superadmin' || 
        userRole === 'administrador' || 
        isSuperAdminEmail ||
        profileData?.permissions?.manageUsers === true ||
        profileData?.permissions?.systemConfig === true;

      if (!isUserAdmin) {
        // Hora de Lima (UTC-5, constante sin horario de verano)
        const limaDate = new Date(Date.now() - 5 * 60 * 60 * 1000);
        const currentHour = limaDate.getUTCHours();
        if (currentHour < 6 || currentHour >= 20) {
          await signOut(auth);
          return { 
            success: false, 
            message: 'Acceso denegado: El horario de acceso permitido para tu rol es de 6:00 AM a 8:00 PM (hora Lima). Los administradores tienen acceso 24/7.' 
          };
        }
      }

      // Actualizar lastLoginAt
      try {
        await updateDoc(userDocRef, { lastLoginAt: new Date().toISOString() });
      } catch {}

      return { success: true };
    } catch (profileErr: any) {
      console.error('Error al consultar perfil en Firestore tras autenticación exitosa:', profileErr);
      if (cleanEmail === 'paulcalebfs123@gmail.com') {
        return { success: true };
      }
      await signOut(auth).catch(() => {});
      return { 
        success: false, 
        message: 'Sesión autenticada, pero ocurrió un problema al cargar tu perfil desde la base de datos. Inténtalo de nuevo.' 
      };
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
    const userEmail = (currentUser.email || '').toLowerCase().trim();
    const userRole = (currentUser.role || '').toLowerCase().trim();
    if (userRole === 'admin' || userRole === 'superadmin' || userEmail === 'paulcalebfs123@gmail.com') {
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
        mustChangePassword: data.mustChangePassword === true,
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

  // 7. Modificar usuario existente (incluyendo cambio de contraseña por administrador si se provee newPassword)
  const updateUser = async (
    id: string,
    updates: Partial<Omit<UserProfile, 'passwordHash' | 'salt'>>,
    newPassword?: string,
    forcePasswordChangeOnNextLogin?: boolean
  ): Promise<{ success: boolean; message?: string }> => {
    try {
      const userRef = doc(db, 'users', id);
      const targetUser = usersList.find(u => u.id === id);

      // Si se especificó una nueva contraseña desde el panel de administración
      if (newPassword && newPassword.trim().length > 0) {
        if (newPassword.trim().length < 6) {
          return { success: false, message: 'La nueva contraseña debe tener al menos 6 caracteres.' };
        }

        // Si el administrador está cambiando su propia contraseña y conoce/usa este modal, o cambia la de otro usuario via Admin SDK
        const fbCurrentUser = auth.currentUser;
        if (!fbCurrentUser) {
          return { success: false, message: 'No hay sesión de administrador activa.' };
        }

        const idToken = await fbCurrentUser.getIdToken();
        const resetRes = await fetch('/api/auth/admin-reset-password', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`
          },
          body: JSON.stringify({
            targetUid: id,
            targetEmail: updates.email || targetUser?.email || '',
            newPassword: newPassword.trim(),
            forcePasswordChangeOnNextLogin: forcePasswordChangeOnNextLogin === true
          })
        });

        const resetData = await resetRes.json().catch(() => null);
        if (!resetRes.ok || !resetData?.success) {
          // Si el usuario objetivo es el mismo usuario autenticado en el cliente, intentar updatePassword directo como respaldo
          if (fbCurrentUser.uid === id) {
            try {
              await updatePassword(fbCurrentUser, newPassword.trim());
            } catch (directErr: any) {
              return {
                success: false,
                message: resetData?.message || directErr?.message || 'Error al actualizar la contraseña en Firebase Auth.'
              };
            }
          } else {
            return {
              success: false,
              message: resetData?.message || 'No se pudo cambiar la contraseña del usuario en Firebase Auth.'
            };
          }
        }
      }

      const payload: Record<string, unknown> = {
        ...updates,
        updatedAt: new Date().toISOString()
      };

      if (forcePasswordChangeOnNextLogin !== undefined) {
        payload.mustChangePassword = forcePasswordChangeOnNextLogin;
      } else if (newPassword && newPassword.trim().length > 0) {
        payload.mustChangePassword = false;
      }

      if (Object.keys(updates).length > 0 || forcePasswordChangeOnNextLogin !== undefined || (newPassword && newPassword.trim().length > 0)) {
        await updateDoc(userRef, payload);
      }

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

  // 10. Cambiar propia contraseña usando Firebase Auth (Exclusivo para Administradores)
  const changeMyPassword = async (currentPassword: string, newPassword: string): Promise<{ success: boolean; message?: string }> => {
    const user = auth.currentUser;
    if (!user || !user.email) {
      return { success: false, message: 'No hay una sesión activa.' };
    }

    const isSuperAdmin = user.email.toLowerCase().trim() === 'paulcalebfs123@gmail.com';
    if (!isSuperAdmin && currentUser?.role !== 'admin') {
      return { success: false, message: 'Solo los administradores pueden cambiar o asignar contraseñas.' };
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

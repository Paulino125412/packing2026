import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { 
  collection, 
  doc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot 
} from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile, UserPermissions, UserRole } from '../types';
import { hashPassword, verifyPassword, verifyPasswordWithMigration } from '../utils/crypto';
import { ROLE_PRESETS } from '../utils/roles';

interface AuthContextType {
  currentUser: UserProfile | null;
  isLoading: boolean;
  usersList: UserProfile[];
  login: (email: string, password: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => void;
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

const LOCAL_STORAGE_SESSION_KEY = 'texflow_auth_session';
const LOCAL_STORAGE_USERS_KEY = 'texflow_local_users';
const SUPER_ADMIN_EMAIL = 'paulcalebfs123@gmail.com';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_SESSION_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [usersList, setUsersList] = useState<UserProfile[]>([]);
  const [mustChangePassword, setMustChangePassword] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_SESSION_KEY);
      if (saved) {
        const u = JSON.parse(saved) as UserProfile;
        return !!u.mustChangePassword;
      }
    } catch {
      // fallback
    }
    return false;
  });

  // Guardar sesión en localStorage
  const saveSession = (user: UserProfile | null) => {
    setCurrentUser(user);
    if (user) {
      localStorage.setItem(LOCAL_STORAGE_SESSION_KEY, JSON.stringify(user));
      setMustChangePassword(!!user.mustChangePassword);
    } else {
      localStorage.removeItem(LOCAL_STORAGE_SESSION_KEY);
      setMustChangePassword(false);
      sessionStorage.removeItem('texflow_must_change_password');
    }
  };

  // Verificar estado de cambio obligatorio de contraseña en base a la cuenta activa
  useEffect(() => {
    if (currentUser) {
      if (currentUser.mustChangePassword) {
        setMustChangePassword(true);
      } else {
        // Validación adicional por seguridad
        verifyPassword('admin123', currentUser.salt, currentUser.passwordHash)
          .then((isDefault) => {
            if (isDefault) {
              setMustChangePassword(true);
            }
          })
          .catch(() => {});
      }
    } else {
      setMustChangePassword(false);
    }
  }, [currentUser]);

  // Inicializar y asegurar que el Super Admin exista
  const ensureSuperAdminExists = useCallback(async (existingUsers: UserProfile[]) => {
    const adminExists = existingUsers.some(
      u => u.email.trim().toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()
    );

    if (!adminExists) {
      try {
        const { hash, salt } = await hashPassword('admin123');
        const adminDocId = 'admin_paulcalebfs123';
        const newAdmin: UserProfile = {
          id: adminDocId,
          name: 'Paul Administrador',
          email: SUPER_ADMIN_EMAIL,
          passwordHash: hash,
          salt: salt,
          role: 'admin',
          status: 'active',
          permissions: { ...ROLE_PRESETS.admin.permissions },
          createdAt: new Date().toISOString(),
          mustChangePassword: true // Forzar cambio obligatorio en el primer acceso
        };

        await setDoc(doc(db, 'users', adminDocId), newAdmin);
      } catch (err) {
        console.warn('Error al auto-crear super admin en Firestore:', err);
      }
    }
  }, []);

  // Escuchar usuarios en tiempo real desde Firestore
  useEffect(() => {
    let unsubscribe: () => void = () => {};

    try {
      const usersColRef = collection(db, 'users');
      unsubscribe = onSnapshot(usersColRef, async (snapshot) => {
        const users: UserProfile[] = [];
        snapshot.forEach((docSnap) => {
          users.push({ id: docSnap.id, ...(docSnap.data() as Omit<UserProfile, 'id'>) });
        });

        // Guardar respaldo local
        localStorage.setItem(LOCAL_STORAGE_USERS_KEY, JSON.stringify(users));
        setUsersList(users);

        // Si no hay usuarios o falta el admin, crearlo
        await ensureSuperAdminExists(users);

        // Si el usuario actual está logueado, sincronizar sus permisos y estado
        setCurrentUser((prev) => {
          if (!prev) return null;
          const freshUser = users.find(u => u.id === prev.id || u.email.toLowerCase() === prev.email.toLowerCase());
          if (!freshUser || freshUser.status === 'inactive') {
            localStorage.removeItem(LOCAL_STORAGE_SESSION_KEY);
            return null;
          }
          localStorage.setItem(LOCAL_STORAGE_SESSION_KEY, JSON.stringify(freshUser));
          if (freshUser.mustChangePassword) {
            setMustChangePassword(true);
          }
          return freshUser;
        });

        setIsLoading(false);
      }, (error) => {
        console.warn('Error al suscribir a colección users (Firestore offline o reglas):', error);
        try {
          const cached = localStorage.getItem(LOCAL_STORAGE_USERS_KEY);
          if (cached) {
            const parsed = JSON.parse(cached) as UserProfile[];
            setUsersList(parsed);
          }
        } catch (e) {
          console.error(e);
        }
        setIsLoading(false);
      });
    } catch (err) {
      console.warn('Error inicializando listener de usuarios:', err);
      setIsLoading(false);
    }

    return () => unsubscribe();
  }, [ensureSuperAdminExists]);

  // Login con migración automática a PBKDF2 y verificación obligatoria de cambio de contraseña
  const login = async (email: string, password: string): Promise<{ success: boolean; message?: string }> => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();

    if (!cleanEmail || !cleanPassword) {
      return { success: false, message: 'Por favor ingresa tu correo y contraseña.' };
    }

    let users = [...usersList];

    if (users.length === 0) {
      try {
        const snap = await getDocs(collection(db, 'users'));
        snap.forEach(d => users.push({ id: d.id, ...(d.data() as Omit<UserProfile, 'id'>) }));
      } catch {
        const local = localStorage.getItem(LOCAL_STORAGE_USERS_KEY);
        if (local) {
          users = JSON.parse(local);
        }
      }
    }

    // Inicializar superadmin en caso de primer arranque offline
    if (users.length === 0 && cleanEmail === SUPER_ADMIN_EMAIL.toLowerCase()) {
      const { hash, salt } = await hashPassword('admin123');
      const seededAdmin: UserProfile = {
        id: 'admin_paulcalebfs123',
        name: 'Paul Administrador',
        email: SUPER_ADMIN_EMAIL,
        passwordHash: hash,
        salt,
        role: 'admin',
        status: 'active',
        permissions: { ...ROLE_PRESETS.admin.permissions },
        createdAt: new Date().toISOString(),
        mustChangePassword: true
      };
      users = [seededAdmin];
      try {
        await setDoc(doc(db, 'users', seededAdmin.id), seededAdmin);
      } catch (err) {
        console.warn('Guardado offline del seed admin:', err);
      }
      localStorage.setItem(LOCAL_STORAGE_USERS_KEY, JSON.stringify(users));
      setUsersList(users);
    }

    const foundUser = users.find(u => u.email.trim().toLowerCase() === cleanEmail);

    if (!foundUser) {
      return { success: false, message: 'No existe una cuenta registrada con este correo electrónico.' };
    }

    if (foundUser.status === 'inactive') {
      return { success: false, message: 'Esta cuenta ha sido desactivada por el administrador. Contacta con soporte.' };
    }

    // Restricción de horario laboral para no-admin (6:00 AM a 8:00 PM)
    const isAdmin = foundUser.role === 'admin' || foundUser.email.trim().toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();
    if (!isAdmin) {
      const currentHour = new Date().getHours();
      if (currentHour < 6 || currentHour >= 20) {
        return { 
          success: false, 
          message: 'Acceso denegado: El horario permitido para tu rol es de 6:00 AM a 8:00 PM. Fuera de este horario solo el Administrador tiene acceso.' 
        };
      }
    }

    // Verificación criptográfica con detección de hashes heredados (SHA-256 vs PBKDF2)
    const { isValid, needsRehash } = await verifyPasswordWithMigration(cleanPassword, foundUser.salt, foundUser.passwordHash);

    if (!isValid) {
      return { success: false, message: 'Contraseña incorrecta. Inténtalo de nuevo.' };
    }

    let finalHash = foundUser.passwordHash;
    let finalSalt = foundUser.salt;

    // Migración silenciosa automática a PBKDF2 (100,000 iteraciones) al primer login exitoso
    if (needsRehash) {
      try {
        const upgraded = await hashPassword(cleanPassword);
        finalHash = upgraded.hash;
        finalSalt = upgraded.salt;
        await updateDoc(doc(db, 'users', foundUser.id), {
          passwordHash: finalHash,
          salt: finalSalt,
          updatedAt: new Date().toISOString()
        });
      } catch (err) {
        console.warn('Error durante auto-migración de hash a PBKDF2:', err);
      }
    }

    const isDefaultKey = cleanPassword === 'admin123';
    const forceChange = !!foundUser.mustChangePassword || isDefaultKey;

    const updatedUser: UserProfile = {
      ...foundUser,
      passwordHash: finalHash,
      salt: finalSalt,
      lastLoginAt: new Date().toISOString(),
      mustChangePassword: forceChange
    };

    try {
      await updateDoc(doc(db, 'users', foundUser.id), {
        lastLoginAt: updatedUser.lastLoginAt,
        mustChangePassword: forceChange
      });
    } catch {
      // Ignorar si offline
    }

    setMustChangePassword(forceChange);
    saveSession(updatedUser);
    return { success: true };
  };

  // Logout
  const logout = () => {
    saveSession(null);
    setMustChangePassword(false);
  };

  // Verificación de permisos
  const hasPermission = (permissionKey: keyof UserPermissions): boolean => {
    if (!currentUser) return false;
    if (currentUser.role === 'admin' || currentUser.email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()) {
      return true;
    }
    return !!currentUser.permissions?.[permissionKey];
  };

  // Crear nuevo usuario (con obligación de cambio de contraseña en su primer acceso)
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

    const exists = usersList.some(u => u.email.toLowerCase() === cleanEmail);
    if (exists) {
      return { success: false, message: `Ya existe un usuario registrado con el correo ${cleanEmail}.` };
    }

    try {
      const { hash, salt } = await hashPassword(data.password);
      const newId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      const newUser: UserProfile = {
        id: newId,
        name: cleanName,
        email: cleanEmail,
        passwordHash: hash,
        salt,
        role: data.role,
        status: 'active',
        permissions: data.permissions,
        createdAt: new Date().toISOString(),
        mustChangePassword: data.mustChangePassword !== undefined ? data.mustChangePassword : true
      };

      await setDoc(doc(db, 'users', newId), newUser);

      const updatedList = [...usersList, newUser];
      setUsersList(updatedList);
      localStorage.setItem(LOCAL_STORAGE_USERS_KEY, JSON.stringify(updatedList));

      return { success: true };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Error desconocido al registrar usuario';
      return { success: false, message: errorMsg };
    }
  };

  // Modificar usuario existente
  const updateUser = async (
    id: string,
    updates: Partial<Omit<UserProfile, 'passwordHash' | 'salt'>>,
    newPassword?: string,
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

      if (newPassword && newPassword.trim()) {
        if (newPassword.trim().length < 6) {
          return { success: false, message: 'La nueva contraseña debe tener al menos 6 caracteres.' };
        }
        const { hash, salt } = await hashPassword(newPassword.trim());
        payload.passwordHash = hash;
        payload.salt = salt;
        // Si el administrador asignó una nueva clave temporal, forzar cambio
        if (forcePasswordChangeOnNextLogin === undefined) {
          payload.mustChangePassword = true;
        }
      }

      await updateDoc(userRef, payload);

      if (currentUser?.id === id) {
        saveSession({
          ...currentUser,
          ...updates,
          ...(payload.passwordHash ? { passwordHash: payload.passwordHash as string, salt: payload.salt as string } : {}),
          ...(payload.mustChangePassword !== undefined ? { mustChangePassword: !!payload.mustChangePassword } : {})
        });
      }

      return { success: true };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Error al actualizar usuario';
      return { success: false, message: errorMsg };
    }
  };

  // Activar / Desactivar estado de usuario
  const toggleUserStatus = async (id: string): Promise<{ success: boolean; message?: string }> => {
    const target = usersList.find(u => u.id === id);
    if (!target) return { success: false, message: 'Usuario no encontrado' };

    if (target.email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()) {
      return { success: false, message: 'No es posible desactivar la cuenta del Administrador Principal.' };
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

  // Eliminar usuario
  const deleteUser = async (id: string): Promise<{ success: boolean; message?: string }> => {
    const target = usersList.find(u => u.id === id);
    if (!target) return { success: false, message: 'Usuario no encontrado' };

    if (target.email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()) {
      return { success: false, message: 'No es posible eliminar la cuenta del Administrador Principal.' };
    }

    try {
      await deleteDoc(doc(db, 'users', id));
      const filtered = usersList.filter(u => u.id !== id);
      setUsersList(filtered);
      localStorage.setItem(LOCAL_STORAGE_USERS_KEY, JSON.stringify(filtered));
      return { success: true };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Error al eliminar usuario';
      return { success: false, message: errorMsg };
    }
  };

  // Cambiar propia contraseña (valida que no sea repetida ni por defecto y elimina el bloqueo obligatorio)
  const changeMyPassword = async (currentPassword: string, newPassword: string): Promise<{ success: boolean; message?: string }> => {
    if (!currentUser) return { success: false, message: 'No hay una sesión activa.' };

    const isMatch = await verifyPassword(currentPassword, currentUser.salt, currentUser.passwordHash);
    if (!isMatch) {
      return { success: false, message: 'La contraseña actual no coincide.' };
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
      const { hash, salt } = await hashPassword(newPassword.trim());
      
      // Actualizar en base de datos Firestore
      await updateDoc(doc(db, 'users', currentUser.id), {
        passwordHash: hash,
        salt: salt,
        mustChangePassword: false,
        updatedAt: new Date().toISOString()
      });

      // Actualizar sesión persistente
      saveSession({
        ...currentUser,
        passwordHash: hash,
        salt: salt,
        mustChangePassword: false
      });

      setMustChangePassword(false);
      sessionStorage.removeItem('texflow_must_change_password');

      return { success: true };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Error al cambiar contraseña';
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

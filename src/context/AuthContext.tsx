import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { 
  collection, 
  doc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  where 
} from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile, UserPermissions, UserRole } from '../types';
import { hashPassword, verifyPassword } from '../utils/crypto';
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
  }) => Promise<{ success: boolean; message?: string }>;
  updateUser: (
    id: string,
    updates: Partial<Omit<UserProfile, 'passwordHash' | 'salt'>>,
    newPassword?: string
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
    return sessionStorage.getItem('texflow_must_change_password') === 'true';
  });

  // Guardar sesión en localStorage
  const saveSession = (user: UserProfile | null) => {
    setCurrentUser(user);
    if (user) {
      localStorage.setItem(LOCAL_STORAGE_SESSION_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(LOCAL_STORAGE_SESSION_KEY);
    }
  };

  // Verificar si la contraseña del usuario actual es la contraseña por defecto admin123
  useEffect(() => {
    if (currentUser) {
      verifyPassword('admin123', currentUser.salt, currentUser.passwordHash)
        .then((isDefault) => {
          if (isDefault) {
            setMustChangePassword(true);
            sessionStorage.setItem('texflow_must_change_password', 'true');
          } else {
            setMustChangePassword(false);
            sessionStorage.removeItem('texflow_must_change_password');
          }
        })
        .catch(() => {
          // Si hay algún error, no forzar cambio
        });
    } else {
      setMustChangePassword(false);
      sessionStorage.removeItem('texflow_must_change_password');
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
          createdAt: new Date().toISOString()
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
        // Corrección: actualizar localStorage directamente para evitar doble invocación anidada de setCurrentUser
        setCurrentUser((prev) => {
          if (!prev) return null;
          const freshUser = users.find(u => u.id === prev.id || u.email.toLowerCase() === prev.email.toLowerCase());
          if (!freshUser || freshUser.status === 'inactive') {
            // Usuario fue eliminado o desactivado
            localStorage.removeItem(LOCAL_STORAGE_SESSION_KEY);
            return null;
          }
          // Actualizar datos directamente en storage y retornar el nuevo usuario
          localStorage.setItem(LOCAL_STORAGE_SESSION_KEY, JSON.stringify(freshUser));
          return freshUser;
        });

        setIsLoading(false);
      }, (error) => {
        console.warn('Error al suscribir a colección users (Firestore offline o reglas):', error);
        // Fallback a localStorage
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

  // Login
  const login = async (email: string, password: string): Promise<{ success: boolean; message?: string }> => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();

    if (!cleanEmail || !cleanPassword) {
      return { success: false, message: 'Por favor ingresa tu correo y contraseña.' };
    }

    let users = [...usersList];

    // Si la lista está vacía, intentar buscar directamente en Firestore o local storage
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

    // Si aún no existe el superadmin (ej. primer arranque offline), inicializarlo
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
        createdAt: new Date().toISOString()
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

    const isMatch = await verifyPassword(cleanPassword, foundUser.salt, foundUser.passwordHash);

    if (!isMatch) {
      return { success: false, message: 'Contraseña incorrecta. Inténtalo de nuevo.' };
    }

    // Login exitoso: Actualizar fecha de último acceso
    const updatedUser: UserProfile = {
      ...foundUser,
      lastLoginAt: new Date().toISOString()
    };

    try {
      await updateDoc(doc(db, 'users', foundUser.id), {
        lastLoginAt: updatedUser.lastLoginAt
      });
    } catch {
      // Ignorar si offline
    }

    if (cleanPassword === 'admin123') {
      setMustChangePassword(true);
      sessionStorage.setItem('texflow_must_change_password', 'true');
    }

    saveSession(updatedUser);
    return { success: true };
  };

  // Logout
  const logout = () => {
    saveSession(null);
    setMustChangePassword(false);
    sessionStorage.removeItem('texflow_must_change_password');
  };

  // Verificación de permisos
  const hasPermission = (permissionKey: keyof UserPermissions): boolean => {
    if (!currentUser) return false;
    // El Super Admin o rol admin tiene siempre acceso a todo
    if (currentUser.role === 'admin' || currentUser.email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()) {
      return true;
    }
    return !!currentUser.permissions?.[permissionKey];
  };

  // Crear nuevo usuario
  const createUser = async (data: {
    name: string;
    email: string;
    password: string;
    role: UserRole;
    permissions: UserPermissions;
  }): Promise<{ success: boolean; message?: string }> => {
    const cleanEmail = data.email.trim().toLowerCase();
    const cleanName = data.name.trim();

    if (!cleanName || !cleanEmail || !data.password) {
      return { success: false, message: 'Todos los campos obligatorios deben ser completados.' };
    }

    if (data.password.length < 6) {
      return { success: false, message: 'La contraseña debe tener al menos 6 caracteres.' };
    }

    // Verificar si ya existe
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
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'users', newId), newUser);

      // Actualizar estado local
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
    newPassword?: string
  ): Promise<{ success: boolean; message?: string }> => {
    try {
      const userRef = doc(db, 'users', id);
      const payload: Record<string, unknown> = {
        ...updates,
        updatedAt: new Date().toISOString()
      };

      if (newPassword && newPassword.trim()) {
        if (newPassword.trim().length < 6) {
          return { success: false, message: 'La nueva contraseña debe tener al menos 6 caracteres.' };
        }
        const { hash, salt } = await hashPassword(newPassword.trim());
        payload.passwordHash = hash;
        payload.salt = salt;
      }

      await updateDoc(userRef, payload);

      // Si es el usuario actual, actualizar sesión
      if (currentUser?.id === id) {
        saveSession({
          ...currentUser,
          ...updates,
          ...(payload.passwordHash ? { passwordHash: payload.passwordHash as string, salt: payload.salt as string } : {})
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

  // Cambiar propia contraseña
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

    try {
      const { hash, salt } = await hashPassword(newPassword.trim());
      await updateDoc(doc(db, 'users', currentUser.id), {
        passwordHash: hash,
        salt: salt,
        updatedAt: new Date().toISOString()
      });

      saveSession({
        ...currentUser,
        passwordHash: hash,
        salt: salt
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

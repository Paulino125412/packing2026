import React, { useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { UserProfile, UserRole, UserPermissions } from '../types';
import { ROLE_PRESETS, PERMISSION_GROUPS, ALL_PERMISSIONS_KEYS } from '../utils/roles';
import { 
  Users, 
  UserPlus, 
  Shield, 
  CheckCircle2, 
  XCircle, 
  Search, 
  Edit3, 
  Trash2, 
  Key, 
  ShieldAlert, 
  Lock, 
  UserCheck, 
  UserX,
  X,
  Check,
  ChevronDown,
  ChevronRight,
  Info
} from 'lucide-react';

const SUPER_ADMIN_EMAIL = 'paulcalebfs123@gmail.com';

export default function UserManager() {
  const { currentUser, usersList, createUser, updateUser, toggleUserStatus, deleteUser } = useAuth();
  const toast = useToast();

  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [targetPasswordUser, setTargetPasswordUser] = useState<UserProfile | null>(null);
  const [newPasswordValue, setNewPasswordValue] = useState('');

  // Form states for Create/Edit
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState<UserRole>('almacen');
  const [formPermissions, setFormPermissions] = useState<UserPermissions>({ ...ROLE_PRESETS.almacen.permissions });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filtered users list
  const filteredUsers = useMemo(() => {
    return usersList.filter(user => {
      const matchQuery = 
        user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.email.toLowerCase().includes(searchQuery.toLowerCase());
      const matchRole = roleFilter === 'all' || user.role === roleFilter;
      return matchQuery && matchRole;
    });
  }, [usersList, searchQuery, roleFilter]);

  // Open modal for new user
  const handleOpenNewUser = () => {
    setEditingUser(null);
    setFormName('');
    setFormEmail('');
    setFormPassword('');
    setFormRole('almacen');
    setFormPermissions({ ...ROLE_PRESETS.almacen.permissions });
    setIsModalOpen(true);
  };

  // Open modal for editing
  const handleOpenEditUser = (user: UserProfile) => {
    setEditingUser(user);
    setFormName(user.name);
    setFormEmail(user.email);
    setFormPassword(''); // Empty by default unless changing
    setFormRole(user.role);
    setFormPermissions({ ...user.permissions });
    setIsModalOpen(true);
  };

  // When changing role in form, apply default template permissions
  const handleRoleChange = (role: UserRole) => {
    setFormRole(role);
    if (role !== 'custom') {
      setFormPermissions({ ...ROLE_PRESETS[role].permissions });
    }
  };

  // Toggle single permission checkbox
  const handleTogglePermission = (key: keyof UserPermissions) => {
    setFormPermissions(prev => {
      const next = { ...prev, [key]: !prev[key] };
      // If manually altered, change role to custom if not admin
      if (formRole !== 'admin' && formRole !== 'custom') {
        setFormRole('custom');
      }
      return next;
    });
  };

  // Select all permissions in group
  const handleSelectGroup = (keys: (keyof UserPermissions)[], selectAll: boolean) => {
    setFormPermissions(prev => {
      const next = { ...prev };
      keys.forEach(k => {
        next[k] = selectAll;
      });
      if (formRole !== 'admin' && formRole !== 'custom') {
        setFormRole('custom');
      }
      return next;
    });
  };

  // Save user form submit
  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formEmail.trim()) {
      toast.error('Completa los campos requeridos', { title: 'Campos incompletos' });
      return;
    }

    if (!editingUser && (!formPassword || formPassword.trim().length < 6)) {
      toast.error('La contraseña inicial debe tener al menos 6 caracteres.', { title: 'Contraseña débil' });
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingUser) {
        // Edit existing
        const res = await updateUser(
          editingUser.id,
          {
            name: formName.trim(),
            email: formEmail.trim().toLowerCase(),
            role: formRole,
            permissions: formPermissions
          },
          formPassword.trim() ? formPassword.trim() : undefined
        );

        if (res.success) {
          toast.success(`Usuario ${formName} actualizado correctamente.`, { title: 'Usuario guardado' });
          setIsModalOpen(false);
        } else {
          toast.error(res.message || 'Error al actualizar usuario', { title: 'Error' });
        }
      } else {
        // Create new
        const res = await createUser({
          name: formName.trim(),
          email: formEmail.trim().toLowerCase(),
          password: formPassword.trim(),
          role: formRole,
          permissions: formPermissions
        });

        if (res.success) {
          toast.success(`Usuario ${formName} creado correctamente.`, { title: 'Usuario registrado' });
          setIsModalOpen(false);
        } else {
          toast.error(res.message || 'Error al crear usuario', { title: 'Error' });
        }
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error inesperado');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Quick Reset Password Submit
  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetPasswordUser) return;
    if (!newPasswordValue.trim() || newPasswordValue.trim().length < 6) {
      toast.error('La nueva contraseña debe tener mínimo 6 caracteres.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await updateUser(targetPasswordUser.id, {}, newPasswordValue.trim());
      if (res.success) {
        toast.success(`Contraseña de ${targetPasswordUser.name} actualizada con éxito.`);
        setIsPasswordModalOpen(false);
        setNewPasswordValue('');
        setTargetPasswordUser(null);
      } else {
        toast.error(res.message || 'Error al cambiar contraseña');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Status toggle
  const handleToggleStatus = async (user: UserProfile) => {
    const res = await toggleUserStatus(user.id);
    if (res.success) {
      toast.info(`Estado de ${user.name} cambiado a ${user.status === 'active' ? 'Inactivo' : 'Activo'}.`);
    } else {
      toast.error(res.message || 'No se pudo cambiar el estado');
    }
  };

  // Delete user
  const handleDelete = async (user: UserProfile) => {
    if (window.confirm(`¿Estás seguro de que deseas eliminar permanentemente a ${user.name} (${user.email})?`)) {
      const res = await deleteUser(user.id);
      if (res.success) {
        toast.success(`Usuario ${user.name} eliminado.`);
      } else {
        toast.error(res.message || 'No se pudo eliminar el usuario');
      }
    }
  };

  // Stats
  const activeCount = usersList.filter(u => u.status === 'active').length;
  const adminCount = usersList.filter(u => u.role === 'admin').length;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Header Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                Gestión de Usuarios y Control de Accesos
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-medium">
                  RBAC
                </span>
              </h2>
              <p className="text-slate-400 text-xs sm:text-sm">
                Administra cuentas, roles y permisos granulares por módulo para cada operador y vendedor
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={handleOpenNewUser}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-sky-500 hover:from-indigo-500 hover:to-sky-400 text-white font-medium text-sm shadow-lg shadow-indigo-500/20 transition-all cursor-pointer shrink-0"
        >
          <UserPlus className="w-4 h-4" />
          <span>Nuevo Usuario</span>
        </button>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-400">Total Usuarios</div>
          <div className="text-2xl font-bold text-white mt-1">{usersList.length}</div>
        </div>
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
          <div className="text-xs font-medium text-emerald-400 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Activos
          </div>
          <div className="text-2xl font-bold text-white mt-1">{activeCount}</div>
        </div>
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
          <div className="text-xs font-medium text-amber-400">Inactivos</div>
          <div className="text-2xl font-bold text-white mt-1">{usersList.length - activeCount}</div>
        </div>
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
          <div className="text-xs font-medium text-indigo-400">Administradores</div>
          <div className="text-2xl font-bold text-white mt-1">{adminCount}</div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por nombre o correo..."
            className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <label className="text-xs text-slate-400 shrink-0">Filtrar por rol:</label>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-300 py-2 px-3 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="all">Todos los roles</option>
            <option value="admin">Administrador</option>
            <option value="almacen">Operador de Almacén</option>
            <option value="vendedor">Agente de Ventas</option>
            <option value="supervisor">Supervisor</option>
            <option value="custom">Personalizado</option>
          </select>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 text-xs font-semibold uppercase tracking-wider">
                <th className="py-3.5 px-4">Usuario</th>
                <th className="py-3.5 px-4">Rol & Permisos</th>
                <th className="py-3.5 px-4 text-center">Estado</th>
                <th className="py-3.5 px-4 text-center">Último Acceso</th>
                <th className="py-3.5 px-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-sm">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-500">
                    No se encontraron usuarios que coincidan con la búsqueda.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => {
                  const isSuperAdmin = user.email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();
                  const allowedCount = Object.values(user.permissions || {}).filter(Boolean).length;
                  const totalCount = ALL_PERMISSIONS_KEYS.length;

                  return (
                    <tr key={user.id} className="hover:bg-slate-800/30 transition-colors">
                      {/* Name & Email */}
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${
                            isSuperAdmin
                              ? 'bg-gradient-to-tr from-amber-500 to-indigo-600 text-white shadow-md'
                              : user.status === 'active'
                              ? 'bg-slate-800 text-indigo-300 border border-slate-700'
                              : 'bg-slate-800 text-slate-500 border border-slate-800'
                          }`}>
                            {user.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-semibold text-white flex items-center gap-2">
                              <span>{user.name}</span>
                              {isSuperAdmin && (
                                <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded font-mono">
                                  SUPER ADMIN
                                </span>
                              )}
                            </div>
                            <div className="text-slate-400 text-xs font-mono">{user.email}</div>
                          </div>
                        </div>
                      </td>

                      {/* Role & Permissions count */}
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-2.5 py-1 rounded-full font-medium inline-flex items-center gap-1 ${
                            user.role === 'admin'
                              ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/30'
                              : user.role === 'almacen'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                              : user.role === 'vendedor'
                              ? 'bg-sky-500/10 text-sky-400 border border-sky-500/30'
                              : user.role === 'supervisor'
                              ? 'bg-purple-500/10 text-purple-400 border border-purple-500/30'
                              : 'bg-slate-800 text-slate-300 border border-slate-700'
                          }`}>
                            <Shield className="w-3 h-3" />
                            {ROLE_PRESETS[user.role]?.label || user.role}
                          </span>
                          <span className="text-xs text-slate-400">
                            ({user.role === 'admin' ? 'Total' : `${allowedCount}/${totalCount} permisos`})
                          </span>
                        </div>
                      </td>

                      {/* Status switch */}
                      <td className="py-4 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(user)}
                          disabled={isSuperAdmin}
                          title={isSuperAdmin ? 'El Super Admin no puede ser desactivado' : 'Cambiar estado'}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                            isSuperAdmin
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 cursor-default'
                              : user.status === 'active'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 cursor-pointer'
                              : 'bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 cursor-pointer'
                          }`}
                        >
                          {user.status === 'active' ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Activo</span>
                            </>
                          ) : (
                            <>
                              <XCircle className="w-3.5 h-3.5 text-red-400" />
                              <span>Inactivo</span>
                            </>
                          )}
                        </button>
                      </td>

                      {/* Last Login */}
                      <td className="py-4 px-4 text-center text-xs text-slate-400">
                        {user.lastLoginAt ? (
                          new Date(user.lastLoginAt).toLocaleString('es-PE', {
                            dateStyle: 'short',
                            timeStyle: 'short'
                          })
                        ) : (
                          <span className="text-slate-600">Nunca</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setTargetPasswordUser(user);
                              setNewPasswordValue('');
                              setIsPasswordModalOpen(true);
                            }}
                            title="Cambiar contraseña de este usuario"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-slate-800 transition-colors cursor-pointer"
                          >
                            <Key className="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleOpenEditUser(user)}
                            title="Editar permisos y datos"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-400 hover:bg-slate-800 transition-colors cursor-pointer"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>

                          {!isSuperAdmin && (
                            <button
                              type="button"
                              onClick={() => handleDelete(user)}
                              title="Eliminar usuario"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-slate-800 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: CREATE / EDIT USER */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20">
                  {editingUser ? <Edit3 className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">
                    {editingUser ? `Editar Usuario: ${editingUser.name}` : 'Crear Nuevo Usuario'}
                  </h3>
                  <p className="text-slate-400 text-xs">
                    Define credenciales y accesos a cada funcionalidad del sistema
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSaveUser} className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Basic Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Nombre Completo *
                  </label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="Ej. Juan Pérez"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Correo Electrónico *
                  </label>
                  <input
                    type="email"
                    required
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="juan@textil.com"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Password Field */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  {editingUser ? 'Nueva Contraseña (dejar en blanco para no cambiarla)' : 'Contraseña Inicial * (mínimo 6 caracteres)'}
                </label>
                <input
                  type="password"
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  placeholder={editingUser ? '••••••••' : 'Ingresa la contraseña para este usuario'}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              {/* Role Presets */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Plantilla de Rol Rápida
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(['admin', 'almacen', 'vendedor', 'supervisor'] as UserRole[]).map((role) => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => handleRoleChange(role)}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        formRole === role
                          ? 'bg-indigo-600/20 border-indigo-500 text-white ring-1 ring-indigo-500'
                          : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                      }`}
                    >
                      <div className="font-semibold text-xs flex items-center justify-between">
                        <span>{ROLE_PRESETS[role].label}</span>
                        {formRole === role && <Check className="w-3.5 h-3.5 text-indigo-400" />}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1 line-clamp-2 leading-tight">
                        {ROLE_PRESETS[role].description}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Granular Permissions Section */}
              <div className="space-y-4 pt-2">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-indigo-400" />
                    Permisos Granulares por Módulo
                  </h4>
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        const allOn = {} as UserPermissions;
                        ALL_PERMISSIONS_KEYS.forEach(k => allOn[k] = true);
                        setFormPermissions(allOn);
                        setFormRole('custom');
                      }}
                      className="text-indigo-400 hover:text-indigo-300 cursor-pointer"
                    >
                      Marcar todos
                    </button>
                    <span className="text-slate-600">|</span>
                    <button
                      type="button"
                      onClick={() => {
                        const allOff = {} as UserPermissions;
                        ALL_PERMISSIONS_KEYS.forEach(k => allOff[k] = false);
                        setFormPermissions(allOff);
                        setFormRole('custom');
                      }}
                      className="text-slate-400 hover:text-slate-300 cursor-pointer"
                    >
                      Desmarcar todos
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  {PERMISSION_GROUPS.map((group) => {
                    const groupKeys = group.permissions.map(p => p.key);
                    const allSelected = groupKeys.every(k => formPermissions[k]);

                    return (
                      <div key={group.name} className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3.5">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold text-indigo-300">{group.name}</span>
                          <button
                            type="button"
                            onClick={() => handleSelectGroup(groupKeys, !allSelected)}
                            className="text-[11px] text-slate-400 hover:text-slate-200"
                          >
                            {allSelected ? 'Desmarcar sección' : 'Marcar sección'}
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {group.permissions.map((perm) => (
                            <label
                              key={perm.key}
                              className={`flex items-start gap-2.5 p-2 rounded-lg border text-xs cursor-pointer transition-all ${
                                formPermissions[perm.key]
                                  ? 'bg-indigo-950/30 border-indigo-500/40 text-slate-200'
                                  : 'bg-slate-900/40 border-slate-800/50 text-slate-400 hover:bg-slate-900'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={!!formPermissions[perm.key]}
                                onChange={() => handleTogglePermission(perm.key)}
                                className="mt-0.5 rounded border-slate-700 bg-slate-950 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-slate-900"
                              />
                              <div>
                                <div className="font-medium text-slate-200">{perm.label}</div>
                                <div className="text-[10px] text-slate-500 leading-tight mt-0.5">
                                  {perm.description}
                                </div>
                              </div>
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-800 text-slate-300 hover:bg-slate-800 text-sm font-medium transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-sky-500 hover:from-indigo-500 hover:to-sky-400 text-white font-medium text-sm shadow-md transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Guardando...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>{editingUser ? 'Actualizar Usuario' : 'Crear Usuario'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: RESET PASSWORD */}
      {isPasswordModalOpen && targetPasswordUser && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
                  <Key className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Resetear Contraseña</h3>
                  <p className="text-xs text-slate-400">{targetPasswordUser.name} ({targetPasswordUser.email})</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPasswordModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleResetPasswordSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Nueva Contraseña (mínimo 6 caracteres)
                </label>
                <input
                  type="password"
                  required
                  value={newPasswordValue}
                  onChange={(e) => setNewPasswordValue(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-400 flex items-start gap-2">
                <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                <span>La contraseña será hasheada con SHA-256 y salt de inmediato. El usuario podrá iniciar sesión con esta nueva clave.</span>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsPasswordModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-800 text-slate-300 text-sm hover:bg-slate-800 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'Guardando...' : 'Establecer Contraseña'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

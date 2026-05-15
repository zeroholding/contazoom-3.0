"use client";

import React, { useState, useEffect } from "react";
import { Users, UserPlus, Shield, Loader2, Store, ShoppingBag, X } from "lucide-react";

type UserData = {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
  connectedAccounts: { provider: string; label: string }[];
};

export default function AdminPanel() {
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  
  // Create User State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({ name: "", email: "", password: "", role: "USER" });

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const res = await fetch("/api/admin/users");
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      } else {
        if (res.status === 403) setError("Acesso negado. Apenas administradores podem ver esta página.");
        else setError("Erro ao carregar usuários.");
      }
    } catch (err) {
      setError("Erro de conexão.");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      });
      
      const data = await res.json();
      if (res.ok) {
        setIsModalOpen(false);
        setFormData({ name: "", email: "", password: "", role: "USER" });
        fetchUsers();
      } else {
        alert(data.error || "Erro ao criar usuário");
      }
    } catch (err) {
      alert("Erro de conexão");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) return <div className="flex justify-center items-center h-full"><Loader2 className="w-8 h-8 animate-spin text-orange-500" /></div>;
  if (error) return <div className="p-8 text-center text-red-600 font-medium">{error}</div>;

  const totalUsers = users.length;
  const totalMeli = users.reduce((acc, user) => acc + user.connectedAccounts.filter(a => a.provider === "mercado-livre").length, 0);
  const totalShopee = users.reduce((acc, user) => acc + user.connectedAccounts.filter(a => a.provider === "shopee").length, 0);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center">
            <Users className="w-6 h-6 mr-2 text-orange-500" /> Gestão de Usuários
          </h1>
          <p className="text-sm text-gray-500 mt-1">Crie e gerencie contas de clientes na plataforma.</p>
        </div>
        
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium transition-colors shadow-sm"
        >
          <UserPlus className="w-4 h-4 mr-2" />
          Novo Usuário
        </button>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm flex items-center">
          <div className="bg-orange-100 p-3 rounded-lg mr-4">
            <Users className="w-6 h-6 text-orange-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Total de Usuários</p>
            <p className="text-2xl font-bold text-gray-900">{totalUsers}</p>
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm flex items-center">
          <div className="bg-yellow-100 p-3 rounded-lg mr-4">
            <Store className="w-6 h-6 text-yellow-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Contas Meli</p>
            <p className="text-2xl font-bold text-gray-900">{totalMeli}</p>
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm flex items-center">
          <div className="bg-orange-50 p-3 rounded-lg mr-4">
            <ShoppingBag className="w-6 h-6 text-orange-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Contas Shopee</p>
            <p className="text-2xl font-bold text-gray-900">{totalShopee}</p>
          </div>
        </div>
      </div>

      {/* Tabela de Usuários */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-sm text-gray-500">
                <th className="p-4 font-medium">Nome / E-mail</th>
                <th className="p-4 font-medium">Data de Cadastro</th>
                <th className="p-4 font-medium">Permissão</th>
                <th className="p-4 font-medium">Contas Conectadas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map(user => (
                <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                  <td className="p-4">
                    <p className="font-semibold text-gray-900">{user.name}</p>
                    <p className="text-sm text-gray-500">{user.email}</p>
                  </td>
                  <td className="p-4 text-sm text-gray-600">
                    {new Date(user.createdAt).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="p-4">
                    <span className={`px-2.5 py-1 text-xs font-semibold rounded-full border ${user.role === 'ADMIN' ? 'bg-orange-50 text-orange-700 border-orange-200' : 'bg-gray-100 text-gray-700 border-gray-200'}`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="flex flex-col gap-1.5">
                      {user.connectedAccounts.length === 0 ? (
                        <span className="text-sm text-gray-400 italic">Nenhuma conta</span>
                      ) : (
                        user.connectedAccounts.map((acc, i) => (
                          <div key={i} className="flex items-center text-xs px-2 py-1.5 rounded-md border" style={{
                            backgroundColor: acc.provider === 'shopee' ? '#fff6ed' : '#fef9c3',
                            borderColor: acc.provider === 'shopee' ? '#fed7aa' : '#fef08a',
                            color: acc.provider === 'shopee' ? '#c2410c' : '#854d0e'
                          }}>
                            {acc.provider === 'shopee' ? <ShoppingBag className="w-3.5 h-3.5 mr-1.5" /> : <Store className="w-3.5 h-3.5 mr-1.5" />}
                            <span className="font-medium truncate max-w-[120px]" title={acc.label}>{acc.label}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Criar Usuário */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-50 flex justify-center items-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="px-6 py-4 border-b flex justify-between items-center bg-gray-50">
              <h3 className="text-lg font-bold text-gray-800">Novo Usuário</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5"/></button>
            </div>
            
            <form onSubmit={handleCreateUser} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome Completo</label>
                <input type="text" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full border-gray-300 rounded-lg shadow-sm px-3 py-2 border focus:border-orange-500 focus:ring-orange-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
                <input type="email" required value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full border-gray-300 rounded-lg shadow-sm px-3 py-2 border focus:border-orange-500 focus:ring-orange-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Senha Inicial</label>
                <input type="password" required value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} className="w-full border-gray-300 rounded-lg shadow-sm px-3 py-2 border focus:border-orange-500 focus:ring-orange-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Permissão de Acesso</label>
                <select value={formData.role} onChange={e => setFormData({...formData, role: e.target.value})} className="w-full border-gray-300 rounded-lg shadow-sm px-3 py-2 border focus:border-orange-500 focus:ring-orange-500">
                  <option value="USER">Cliente Normal (USER)</option>
                  <option value="ADMIN">Administrador (ADMIN)</option>
                </select>
              </div>

              <div className="pt-4 border-t flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg font-medium transition-colors">Cancelar</button>
                <button type="submit" disabled={isSubmitting} className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium transition-colors flex items-center">
                  {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UserPlus className="w-4 h-4 mr-2" />} Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

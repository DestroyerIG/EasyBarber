'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { useToast } from '@/components/Toast';
import { AxiosError } from 'axios';

export default function LoginPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    barbershopName: '',
    ownerName: '',
    whatsapp: '',
    plan: 'basico'
  });
  const router = useRouter();
  const { showToast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        const response = await api.post('/auth/login', {
          email: formData.email,
          password: formData.password
        });

        localStorage.setItem('token', response.data.token);
        localStorage.setItem('user', JSON.stringify(response.data.user));
        showToast('Login realizado com sucesso!', 'success');
        router.push('/dashboard');
      } else {
        const response = await api.post('/auth/register', {
          barbershopName: formData.barbershopName,
          ownerName: formData.ownerName,
          email: formData.email,
          whatsapp: formData.whatsapp,
          password: formData.password,
          plan: formData.plan
        });

        localStorage.setItem('token', response.data.token);
        localStorage.setItem('user', JSON.stringify(response.data.barbershop));
        showToast('Barbearia cadastrada com sucesso!', 'success');
        router.push('/dashboard');
      }
    } catch (error: unknown) {
      if (error instanceof AxiosError) {
        const message = error.response?.data?.error
          || error.response?.data?.details?.join(', ')
          || 'Erro ao processar solicitação';
        showToast(message, 'error');
      } else {
        showToast('Erro inesperado. Tente novamente.', 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-black to-dark-light p-4">
      <div className="bg-dark-light rounded-2xl shadow-2xl w-full max-w-md p-8 border border-primary/20">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-primary mb-2">💈 BarberPro</h1>
          <p className="text-gray-400">Sistema completo para sua barbearia</p>
        </div>

        <div className="flex mb-8">
          <button
            className={`flex-1 py-3 font-semibold transition-all ${isLogin
                ? 'bg-primary text-black rounded-lg'
                : 'text-gray-400 hover:text-white'
              }`}
            onClick={() => setIsLogin(true)}
          >
            Login
          </button>
          <button
            className={`flex-1 py-3 font-semibold transition-all ${!isLogin
                ? 'bg-primary text-black rounded-lg'
                : 'text-gray-400 hover:text-white'
              }`}
            onClick={() => setIsLogin(false)}
          >
            Cadastre-se
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <>
              <input
                type="text"
                name="barbershopName"
                placeholder="Nome da Barbearia"
                value={formData.barbershopName}
                onChange={handleChange}
                required={!isLogin}
                className="w-full px-4 py-3 bg-black/50 border border-gray-700 rounded-lg text-white focus:border-primary focus:outline-none transition-all"
              />
              <input
                type="text"
                name="ownerName"
                placeholder="Nome do Responsável"
                value={formData.ownerName}
                onChange={handleChange}
                required={!isLogin}
                className="w-full px-4 py-3 bg-black/50 border border-gray-700 rounded-lg text-white focus:border-primary focus:outline-none transition-all"
              />
              <input
                type="tel"
                name="whatsapp"
                placeholder="WhatsApp"
                value={formData.whatsapp}
                onChange={handleChange}
                required={!isLogin}
                className="w-full px-4 py-3 bg-black/50 border border-gray-700 rounded-lg text-white focus:border-primary focus:outline-none transition-all"
              />
              <select
                name="plan"
                value={formData.plan}
                onChange={handleChange}
                className="w-full px-4 py-3 bg-black/50 border border-gray-700 rounded-lg text-white focus:border-primary focus:outline-none transition-all"
              >
                <option value="basico">Plano Básico</option>
                <option value="profissional">Plano Profissional</option>
                <option value="premium">Plano Premium</option>
              </select>
            </>
          )}

          <input
            type="email"
            name="email"
            placeholder="Email"
            value={formData.email}
            onChange={handleChange}
            required
            className="w-full px-4 py-3 bg-black/50 border border-gray-700 rounded-lg text-white focus:border-primary focus:outline-none transition-all"
          />
          <input
            type="password"
            name="password"
            placeholder="Senha"
            value={formData.password}
            onChange={handleChange}
            required
            className="w-full px-4 py-3 bg-black/50 border border-gray-700 rounded-lg text-white focus:border-primary focus:outline-none transition-all"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-primary hover:bg-orange-600 text-black font-bold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed text-lg"
          >
            {loading ? 'Processando...' : isLogin ? 'Entrar' : 'Criar Conta'}
          </button>
        </form>

        {isLogin && (
          <div className="mt-4 text-center">
            <button
              onClick={() => showToast('Funcionalidade em desenvolvimento', 'info')}
              className="text-primary hover:text-orange-400 text-sm"
            >
              Esqueci minha senha
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

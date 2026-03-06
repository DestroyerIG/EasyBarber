'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
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
  });
  const { login, register } = useAuth();
  const { showToast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        await login(formData.email, formData.password);
        showToast('Login realizado com sucesso!', 'success');
      } else {
        await register({
          barbershopName: formData.barbershopName,
          ownerName: formData.ownerName,
          email: formData.email,
          whatsapp: formData.whatsapp,
          password: formData.password,
        });
        showToast('Barbearia cadastrada com sucesso!', 'success');
      }
    } catch (error: unknown) {
      if (error instanceof AxiosError) {
        const resData = error.response?.data;
        const message =
          resData?.details?.join(' | ') ||
          (typeof resData?.error === 'string' ? resData.error : resData?.error?.message) ||
          'Erro ao processar solicitação';
        showToast(message, 'error');
      } else {
        showToast('Erro inesperado. Tente novamente.', 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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

        <form onSubmit={handleSubmit} className="space-y-4" aria-label={isLogin ? 'Formulário de login' : 'Formulário de cadastro'}>
          {!isLogin && (
            <>
              <div>
                <label htmlFor="barbershopName" className="sr-only">Nome da Barbearia</label>
                <input
                  id="barbershopName"
                  type="text"
                  name="barbershopName"
                  placeholder="Nome da Barbearia"
                  value={formData.barbershopName}
                  onChange={handleChange}
                  required={!isLogin}
                  className="input"
                />
              </div>
              <div>
                <label htmlFor="ownerName" className="sr-only">Nome do Responsável</label>
                <input
                  id="ownerName"
                  type="text"
                  name="ownerName"
                  placeholder="Nome do Responsável"
                  value={formData.ownerName}
                  onChange={handleChange}
                  required={!isLogin}
                  className="input"
                />
              </div>
              <div>
                <label htmlFor="whatsapp" className="sr-only">WhatsApp</label>
                <input
                  id="whatsapp"
                  type="tel"
                  name="whatsapp"
                  placeholder="WhatsApp"
                  value={formData.whatsapp}
                  onChange={handleChange}
                  required={!isLogin}
                  className="input"
                />
              </div>
            </>
          )}

          <div>
            <label htmlFor="email" className="sr-only">Email</label>
            <input
              id="email"
              type="email"
              name="email"
              placeholder="Email"
              value={formData.email}
              onChange={handleChange}
              required
              className="input"
            />
          </div>
          <div>
            <label htmlFor="password" className="sr-only">Senha</label>
            <input
              id="password"
              type="password"
              name="password"
              placeholder={isLogin ? 'Senha' : 'Senha (mín 8 chars, maiúscula + número)'}
              value={formData.password}
              onChange={handleChange}
              required
              minLength={isLogin ? 1 : 8}
              className="input"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 btn-primary text-lg disabled:opacity-50 disabled:cursor-not-allowed"
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

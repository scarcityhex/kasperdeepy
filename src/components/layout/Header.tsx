'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useAuth } from '@/app/contexts/AuthContext';
import Modal from '../ui/Modal';
import LoginForm from '../auth/LoginForm';

export default function Header() {
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const { user, logout, loading } = useAuth();

  const handleLogout = async () => {
    try {
      await logout();
      setShowUserMenu(false);
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  return (
    <>
      <header className="bg-transparent shadow-md border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo */}
            <div className="flex items-center">
              <Link href="/" className="flex items-center gap-2">
                <Image
                  src="/Ada/CW5312noBG.png"
                  alt="Left mascot"
                  width={40}
                  height={40}
                  className="h-10 w-10 object-contain"
                />
                <h1 className="text-2xl font-bold text-gray-100">
                  Kasper&Deepy
                </h1>
                <Image
                  src="/Ada/CW7811noBG.png"
                  alt="Right mascot"
                  width={40}
                  height={40}
                  className="h-10 w-10 object-contain -scale-x-100"
                />
              </Link>
            </div>

            <nav className="hidden md:flex space-x-8">
          
            
            
            </nav>

            <div className="flex items-center space-x-4">
              {loading ? (
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              ) : user ? (
                <div className="relative">
                  <button
                    onClick={() => setShowUserMenu(!showUserMenu)}
                    className="flex items-center space-x-2 text-gray-300 hover:text-blue-400 transition-colors"
                  >
                    {user.photoURL ? (
                      <Image
                        src={user.photoURL}
                        alt="Avatar"
                        width={32}
                        height={32}
                        className="w-8 h-8 rounded-full"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-medium">
                        {user.displayName?.[0] || user.email?.[0] || 'U'}
                      </div>
                    )}
                    <span className="hidden md:block">
                      {user.displayName || user.email?.split('@')[0] || 'User'}
                    </span>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {showUserMenu && (
                    <div className="absolute right-0 mt-2 w-48 bg-gray-800 rounded-md shadow-lg py-1 z-50 border border-gray-700">
                      <Link
                        href="#" 
                        className="block px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 transition-colors"
                      >
                        My Profile
                      </Link>
                      <Link
                        href="#" 
                        className="block px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 transition-colors"
                      >
                        Settings
                      </Link>
                      <hr className="my-1 border-gray-600" />
                      <button
                        onClick={handleLogout}
                        className="block w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 transition-colors"
                      >
                        Logout
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => setShowLoginModal(true)}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Sign In
                </button>
              )}

              {/* Mobile menu button */}
              <button className="md:hidden p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </header>

      <Modal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        size="md"
      >
        <LoginForm onClose={() => setShowLoginModal(false)} />
      </Modal>

      {showUserMenu && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowUserMenu(false)}
        />
      )}
    </>
  );
}
import { create } from 'zustand';
import type { Notification } from '@/types';

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  isConnected: boolean;

  // Actions
  addNotification: (notification: Notification) => void;
  markAsRead: (notificationId: string) => void;
  markAllAsRead: () => void;
  removeNotification: (notificationId: string) => void;
  clearNotifications: () => void;
  setNotifications: (notifications: Notification[]) => void;
  setConnected: (connected: boolean) => void;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],
  unreadCount: 0,
  isConnected: false,

  addNotification: (notification) => set((state) => {
    const notifications = [notification, ...state.notifications].slice(0, 100);
    return {
      notifications,
      unreadCount: notifications.filter(n => !n.read).length,
    };
  }),

  markAsRead: (notificationId) => set((state) => {
    const notifications = state.notifications.map(n =>
      n.id === notificationId ? { ...n, read: true } : n
    );
    return {
      notifications,
      unreadCount: notifications.filter(n => !n.read).length,
    };
  }),

  markAllAsRead: () => set((state) => ({
    notifications: state.notifications.map(n => ({ ...n, read: true })),
    unreadCount: 0,
  })),

  removeNotification: (notificationId) => set((state) => {
    const notifications = state.notifications.filter(n => n.id !== notificationId);
    return {
      notifications,
      unreadCount: notifications.filter(n => !n.read).length,
    };
  }),

  clearNotifications: () => set({ notifications: [], unreadCount: 0 }),

  setNotifications: (notifications) => set({
    notifications,
    unreadCount: notifications.filter(n => !n.read).length,
  }),

  setConnected: (connected) => set({ isConnected: connected }),
}));

import { describe, it, expect, beforeEach } from 'vitest';
import { useNotificationStore } from './notificationStore';
import type { Notification } from '@/types';

describe('notificationStore', () => {
  const mockNotification: Notification = {
    id: 'notif-1',
    type: 'file_uploaded',
    title: 'File Uploaded',
    message: 'test.txt has been uploaded',
    read: false,
    createdAt: '2024-01-01T00:00:00Z',
  };

  beforeEach(() => {
    useNotificationStore.setState({
      notifications: [],
      unreadCount: 0,
      isConnected: false,
    });
  });

  describe('addNotification', () => {
    it('should add notification', () => {
      const { addNotification } = useNotificationStore.getState();

      addNotification(mockNotification);

      const state = useNotificationStore.getState();
      expect(state.notifications).toContainEqual(mockNotification);
      expect(state.unreadCount).toBe(1);
    });

    it('should prepend new notifications', () => {
      const { addNotification } = useNotificationStore.getState();

      addNotification(mockNotification);
      addNotification({ ...mockNotification, id: 'notif-2' });

      const state = useNotificationStore.getState();
      expect(state.notifications[0].id).toBe('notif-2');
    });

    it('should limit to 100 notifications', () => {
      const { addNotification } = useNotificationStore.getState();

      for (let i = 0; i < 105; i++) {
        addNotification({ ...mockNotification, id: `notif-${i}` });
      }

      expect(useNotificationStore.getState().notifications).toHaveLength(100);
    });
  });

  describe('markAsRead', () => {
    it('should mark notification as read', () => {
      useNotificationStore.setState({
        notifications: [mockNotification],
        unreadCount: 1,
      });

      const { markAsRead } = useNotificationStore.getState();
      markAsRead('notif-1');

      const state = useNotificationStore.getState();
      expect(state.notifications[0].read).toBe(true);
      expect(state.unreadCount).toBe(0);
    });
  });

  describe('markAllAsRead', () => {
    it('should mark all notifications as read', () => {
      useNotificationStore.setState({
        notifications: [
          mockNotification,
          { ...mockNotification, id: 'notif-2' },
        ],
        unreadCount: 2,
      });

      const { markAllAsRead } = useNotificationStore.getState();
      markAllAsRead();

      const state = useNotificationStore.getState();
      expect(state.notifications.every((n) => n.read)).toBe(true);
      expect(state.unreadCount).toBe(0);
    });
  });

  describe('removeNotification', () => {
    it('should remove notification', () => {
      useNotificationStore.setState({
        notifications: [mockNotification],
        unreadCount: 1,
      });

      const { removeNotification } = useNotificationStore.getState();
      removeNotification('notif-1');

      const state = useNotificationStore.getState();
      expect(state.notifications).toHaveLength(0);
      expect(state.unreadCount).toBe(0);
    });
  });

  describe('clearNotifications', () => {
    it('should clear all notifications', () => {
      useNotificationStore.setState({
        notifications: [mockNotification],
        unreadCount: 1,
      });

      const { clearNotifications } = useNotificationStore.getState();
      clearNotifications();

      const state = useNotificationStore.getState();
      expect(state.notifications).toHaveLength(0);
      expect(state.unreadCount).toBe(0);
    });
  });

  describe('setConnected', () => {
    it('should set connection state', () => {
      const { setConnected } = useNotificationStore.getState();

      setConnected(true);
      expect(useNotificationStore.getState().isConnected).toBe(true);

      setConnected(false);
      expect(useNotificationStore.getState().isConnected).toBe(false);
    });
  });
});

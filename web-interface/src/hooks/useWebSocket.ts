import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { config } from '@/config';
import { useAuthStore } from '@/store/authStore';
import { useNotificationStore } from '@/store/notificationStore';
import { useFileStore } from '@/store/fileStore';
import type { Notification, FileItem, ProcessingJob } from '@/types';

interface ServerToClientEvents {
  notification: (notification: Notification) => void;
  'file:created': (file: FileItem) => void;
  'file:updated': (file: FileItem) => void;
  'file:deleted': (fileId: string) => void;
  'processing:progress': (job: ProcessingJob) => void;
  'processing:completed': (job: ProcessingJob) => void;
  'processing:failed': (job: ProcessingJob) => void;
}

interface ClientToServerEvents {
  authenticate: (token: string) => void;
  subscribe: (channel: string) => void;
  unsubscribe: (channel: string) => void;
}

export function useWebSocket() {
  const socketRef = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);
  const { tokens, isAuthenticated } = useAuthStore();
  const { addNotification, setConnected } = useNotificationStore();
  const { addFile, updateFile, removeFile } = useFileStore();

  const connect = useCallback(() => {
    if (!isAuthenticated || !tokens?.accessToken) {
      return;
    }

    if (socketRef.current?.connected) {
      return;
    }

    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(config.wsUrl, {
      auth: {
        token: tokens.accessToken,
      },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      console.log('WebSocket connected');
      setConnected(true);
    });

    socket.on('disconnect', () => {
      console.log('WebSocket disconnected');
      setConnected(false);
    });

    socket.on('notification', (notification: Notification) => {
      addNotification(notification);
    });

    socket.on('file:created', (file: FileItem) => {
      addFile(file);
    });

    socket.on('file:updated', (file: FileItem) => {
      updateFile(file.id, file);
    });

    socket.on('file:deleted', (fileId: string) => {
      removeFile(fileId);
    });

    socket.on('processing:progress', (job: ProcessingJob) => {
      // Update processing job progress in UI
      console.log('Processing progress:', job);
    });

    socket.on('processing:completed', (job: ProcessingJob) => {
      addNotification({
        id: `processing-${job.id}`,
        type: 'file_processed',
        title: 'Processing Complete',
        message: `File processing completed successfully`,
        read: false,
        createdAt: new Date().toISOString(),
        data: { jobId: job.id, fileId: job.fileId },
      });
    });

    socket.on('processing:failed', (job: ProcessingJob) => {
      addNotification({
        id: `processing-${job.id}`,
        type: 'processing_failed',
        title: 'Processing Failed',
        message: job.error || 'File processing failed',
        read: false,
        createdAt: new Date().toISOString(),
        data: { jobId: job.id, fileId: job.fileId },
      });
    });

    socketRef.current = socket;
  }, [isAuthenticated, tokens, addNotification, setConnected, addFile, updateFile, removeFile]);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
      setConnected(false);
    }
  }, [setConnected]);

  const subscribe = useCallback((channel: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('subscribe', channel);
    }
  }, []);

  const unsubscribe = useCallback((channel: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('unsubscribe', channel);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [isAuthenticated, connect, disconnect]);

  return {
    isConnected: socketRef.current?.connected || false,
    subscribe,
    unsubscribe,
  };
}

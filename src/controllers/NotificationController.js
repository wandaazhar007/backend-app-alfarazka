import * as NotificationService from '../services/NotificationService.js';

export const list = async (req, res) => {
  const [notifications, unreadCount] = await Promise.all([
    NotificationService.listForUser(req.user.id),
    NotificationService.getUnreadCount(req.user.id),
  ]);

  res.json({ notifications, unreadCount });
};

export const markRead = async (req, res) => {
  const { id } = req.params;
  const notification = await NotificationService.markAsRead(id, req.user.id);

  if (!notification) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Notifikasi tidak ditemukan' });
  }

  res.json(notification);
};

export const markAllRead = async (req, res) => {
  await NotificationService.markAllAsRead(req.user.id);
  res.status(204).send();
};

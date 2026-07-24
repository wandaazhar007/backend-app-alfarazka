import * as PushNotificationService from '../services/PushNotificationService.js';

export const register = async (req, res) => {
  const { expoPushToken } = req.body;

  if (!expoPushToken || typeof expoPushToken !== 'string') {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'expoPushToken wajib diisi' });
  }

  await PushNotificationService.saveToken({ userId: req.user.id, expoPushToken });

  res.status(204).send();
};

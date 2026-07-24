import { Router } from 'express';
import * as NotificationController from '../controllers/NotificationController.js';
import VerifyFirebaseToken from '../middlewares/VerifyFirebaseToken.js';
import CheckLicense from '../middlewares/CheckLicense.js';

const router = Router();

router.get('/api/notifications', VerifyFirebaseToken, CheckLicense, NotificationController.list);
router.put('/api/notifications/read-all', VerifyFirebaseToken, CheckLicense, NotificationController.markAllRead);
router.put('/api/notifications/:id/read', VerifyFirebaseToken, CheckLicense, NotificationController.markRead);

export default router;

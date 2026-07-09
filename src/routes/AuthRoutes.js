import { Router } from 'express';
import * as AuthController from '../controllers/AuthController.js';
import VerifyFirebaseToken from '../middlewares/VerifyFirebaseToken.js';
import VerifyFirebaseTokenOnly from '../middlewares/VerifyFirebaseTokenOnly.js';

const router = Router();

router.post('/api/auth/sync', VerifyFirebaseTokenOnly, AuthController.sync);
router.get('/api/auth/me', VerifyFirebaseToken, AuthController.me);
router.post('/api/auth/change-password', VerifyFirebaseToken, AuthController.changePassword);

export default router;

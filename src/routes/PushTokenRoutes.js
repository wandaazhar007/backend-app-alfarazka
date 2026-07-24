import { Router } from 'express';
import * as PushTokenController from '../controllers/PushTokenController.js';
import VerifyFirebaseToken from '../middlewares/VerifyFirebaseToken.js';
import CheckLicense from '../middlewares/CheckLicense.js';

const router = Router();

router.post('/api/push-token', VerifyFirebaseToken, CheckLicense, PushTokenController.register);

export default router;

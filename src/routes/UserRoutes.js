import { Router } from 'express';
import * as UserController from '../controllers/UserController.js';
import VerifyFirebaseToken from '../middlewares/VerifyFirebaseToken.js';
import CheckLicense from '../middlewares/CheckLicense.js';
import RequireRole from '../middlewares/RequireRole.js';

const router = Router();

router.get('/api/users', VerifyFirebaseToken, CheckLicense, RequireRole(['owner']), UserController.list);
router.post('/api/users', VerifyFirebaseToken, CheckLicense, RequireRole(['owner']), UserController.create);
router.put('/api/users/:id', VerifyFirebaseToken, CheckLicense, RequireRole(['owner']), UserController.update);
router.post(
  '/api/users/:id/reset-password',
  VerifyFirebaseToken,
  CheckLicense,
  RequireRole(['owner']),
  UserController.resetPassword
);

export default router;

import { Router } from 'express';
import * as QrisSettlementController from '../controllers/QrisSettlementController.js';
import VerifyFirebaseToken from '../middlewares/VerifyFirebaseToken.js';
import CheckLicense from '../middlewares/CheckLicense.js';
import RequireRole from '../middlewares/RequireRole.js';

const router = Router();

router.post(
  '/api/qris-settlements',
  VerifyFirebaseToken,
  CheckLicense,
  RequireRole(['admin']),
  QrisSettlementController.create
);

export default router;

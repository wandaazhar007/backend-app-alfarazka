import { Router } from 'express';
import * as ReceivableController from '../controllers/ReceivableController.js';
import VerifyFirebaseToken from '../middlewares/VerifyFirebaseToken.js';
import CheckLicense from '../middlewares/CheckLicense.js';
import RequireRole from '../middlewares/RequireRole.js';

const router = Router();

router.get(
  '/api/receivables',
  VerifyFirebaseToken,
  CheckLicense,
  RequireRole(['admin', 'owner']),
  ReceivableController.list
);
router.post(
  '/api/receivables/:id/payments',
  VerifyFirebaseToken,
  CheckLicense,
  RequireRole(['admin']),
  ReceivableController.addPayment
);

export default router;

import { Router } from 'express';
import * as SellerDebtController from '../controllers/SellerDebtController.js';
import VerifyFirebaseToken from '../middlewares/VerifyFirebaseToken.js';
import CheckLicense from '../middlewares/CheckLicense.js';
import RequireRole from '../middlewares/RequireRole.js';

const router = Router();

router.get(
  '/api/seller-debts',
  VerifyFirebaseToken,
  CheckLicense,
  RequireRole(['admin', 'owner']),
  SellerDebtController.list
);
router.post(
  '/api/seller-debts/settle',
  VerifyFirebaseToken,
  CheckLicense,
  RequireRole(['admin']),
  SellerDebtController.settle
);
router.post(
  '/api/seller-debts/loans',
  VerifyFirebaseToken,
  CheckLicense,
  RequireRole(['admin']),
  SellerDebtController.createLoan
);
router.post(
  '/api/seller-debts/:id/payments',
  VerifyFirebaseToken,
  CheckLicense,
  RequireRole(['admin']),
  SellerDebtController.addPayment
);

export default router;

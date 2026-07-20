import { Router } from 'express';
import * as SellerPayrollController from '../controllers/SellerPayrollController.js';
import VerifyFirebaseToken from '../middlewares/VerifyFirebaseToken.js';
import CheckLicense from '../middlewares/CheckLicense.js';
import RequireRole from '../middlewares/RequireRole.js';

const router = Router();

router.get(
  '/api/seller-payroll',
  VerifyFirebaseToken,
  CheckLicense,
  RequireRole(['admin', 'owner']),
  SellerPayrollController.list
);
router.get(
  '/api/seller-payroll/preview',
  VerifyFirebaseToken,
  CheckLicense,
  RequireRole(['admin', 'owner']),
  SellerPayrollController.preview
);
router.post(
  '/api/seller-payroll/generate',
  VerifyFirebaseToken,
  CheckLicense,
  RequireRole(['admin']),
  SellerPayrollController.generate
);
router.post(
  '/api/seller-payroll/:id/confirm',
  VerifyFirebaseToken,
  CheckLicense,
  RequireRole(['admin']),
  SellerPayrollController.confirm
);

export default router;

import { Router } from 'express';
import * as ReportController from '../controllers/ReportController.js';
import VerifyFirebaseToken from '../middlewares/VerifyFirebaseToken.js';
import CheckLicense from '../middlewares/CheckLicense.js';
import RequireRole from '../middlewares/RequireRole.js';

const router = Router();

router.get('/api/reports/daily', VerifyFirebaseToken, CheckLicense, RequireRole(['admin', 'owner']), ReportController.daily);
router.get(
  '/api/reports/keliling-status',
  VerifyFirebaseToken,
  CheckLicense,
  RequireRole(['admin', 'owner']),
  ReportController.kelilingStatus
);
router.get(
  '/api/reports/export',
  VerifyFirebaseToken,
  CheckLicense,
  RequireRole(['admin', 'owner']),
  ReportController.exportReport
);
router.get('/api/reports/trend', VerifyFirebaseToken, CheckLicense, RequireRole(['admin', 'owner']), ReportController.trend);
router.get(
  '/api/reports/seller-comparison',
  VerifyFirebaseToken,
  CheckLicense,
  RequireRole(['admin', 'owner']),
  ReportController.sellerComparison
);

export default router;

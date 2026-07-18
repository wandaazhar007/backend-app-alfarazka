import { Router } from 'express';
import * as DailyClosingController from '../controllers/DailyClosingController.js';
import VerifyFirebaseToken from '../middlewares/VerifyFirebaseToken.js';
import CheckLicense from '../middlewares/CheckLicense.js';
import RequireRole from '../middlewares/RequireRole.js';

const router = Router();

router.post(
  '/api/daily-closings',
  VerifyFirebaseToken,
  CheckLicense,
  RequireRole(['admin']),
  DailyClosingController.generate
);
router.get(
  '/api/daily-closings',
  VerifyFirebaseToken,
  CheckLicense,
  RequireRole(['admin', 'owner']),
  DailyClosingController.list
);
router.get(
  '/api/daily-closings/range-totals',
  VerifyFirebaseToken,
  CheckLicense,
  RequireRole(['admin', 'owner']),
  DailyClosingController.rangeTotals
);

export default router;

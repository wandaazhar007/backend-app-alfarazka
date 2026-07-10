import { Router } from 'express';
import * as StockMovementController from '../controllers/StockMovementController.js';
import VerifyFirebaseToken from '../middlewares/VerifyFirebaseToken.js';
import CheckLicense from '../middlewares/CheckLicense.js';
import RequireRole from '../middlewares/RequireRole.js';

const router = Router();

router.post('/api/stock-movements', VerifyFirebaseToken, CheckLicense, RequireRole(['admin']), StockMovementController.create);
router.put(
  '/api/stock-movements/return-batch',
  VerifyFirebaseToken,
  CheckLicense,
  RequireRole(['admin']),
  StockMovementController.setReturnBatch
);
router.put(
  '/api/stock-movements/:id/return',
  VerifyFirebaseToken,
  CheckLicense,
  RequireRole(['admin']),
  StockMovementController.setReturn
);
router.get(
  '/api/stock-movements',
  VerifyFirebaseToken,
  CheckLicense,
  RequireRole(['admin', 'owner', 'seller']),
  StockMovementController.list
);
router.delete(
  '/api/stock-movements/seller/:sellerId/date/:date',
  VerifyFirebaseToken,
  CheckLicense,
  RequireRole(['admin']),
  StockMovementController.removeBySellerAndDate
);

export default router;

import { Router } from 'express';
import * as SellerController from '../controllers/SellerController.js';
import VerifyFirebaseToken from '../middlewares/VerifyFirebaseToken.js';
import CheckLicense from '../middlewares/CheckLicense.js';
import RequireRole from '../middlewares/RequireRole.js';

const router = Router();

router.get('/api/sellers', VerifyFirebaseToken, CheckLicense, RequireRole(['admin', 'owner']), SellerController.list);
router.post('/api/sellers', VerifyFirebaseToken, CheckLicense, RequireRole(['admin']), SellerController.create);
router.put('/api/sellers/:id', VerifyFirebaseToken, CheckLicense, RequireRole(['admin']), SellerController.update);
router.delete('/api/sellers/:id', VerifyFirebaseToken, CheckLicense, RequireRole(['admin']), SellerController.remove);
router.get(
  '/api/seller/today-stock',
  VerifyFirebaseToken,
  CheckLicense,
  RequireRole(['seller']),
  SellerController.todayStock
);
router.get('/api/seller/my-sales', VerifyFirebaseToken, CheckLicense, RequireRole(['seller']), SellerController.mySales);

export default router;

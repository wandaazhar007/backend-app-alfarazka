import { Router } from 'express';
import * as LicenseController from '../controllers/LicenseController.js';
import VerifyFirebaseToken from '../middlewares/VerifyFirebaseToken.js';
import RequireRole from '../middlewares/RequireRole.js';

const router = Router();

// This route intentionally does NOT use CheckLicense — so clients with an
// expired license can still view their license status and make a payment to renew it.
router.get('/api/license/status', VerifyFirebaseToken, LicenseController.status);
router.get('/api/license/plans', VerifyFirebaseToken, LicenseController.plans);
router.post('/api/license/checkout', VerifyFirebaseToken, RequireRole(['owner', 'admin']), LicenseController.checkout);
router.post('/api/license/midtrans-callback', LicenseController.midtransCallback);
router.get('/api/license/payments', VerifyFirebaseToken, RequireRole(['owner']), LicenseController.payments);

export default router;

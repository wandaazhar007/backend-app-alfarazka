import { Router } from 'express';
import * as SellerLocationController from '../controllers/SellerLocationController.js';
import VerifyFirebaseToken from '../middlewares/VerifyFirebaseToken.js';
import CheckLicense from '../middlewares/CheckLicense.js';
import RequireRole from '../middlewares/RequireRole.js';

const router = Router();

router.post(
  '/api/seller/location',
  VerifyFirebaseToken,
  CheckLicense,
  RequireRole(['seller']),
  SellerLocationController.create
);
router.get(
  '/api/sellers/locations',
  VerifyFirebaseToken,
  CheckLicense,
  RequireRole(['admin', 'owner']),
  SellerLocationController.list
);
router.get(
  '/api/sellers/:id/location-trail',
  VerifyFirebaseToken,
  CheckLicense,
  RequireRole(['admin', 'owner']),
  SellerLocationController.trail
);

export default router;

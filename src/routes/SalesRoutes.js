import { Router } from 'express';
import * as SalesController from '../controllers/SalesController.js';
import VerifyFirebaseToken from '../middlewares/VerifyFirebaseToken.js';
import CheckLicense from '../middlewares/CheckLicense.js';
import RequireRole from '../middlewares/RequireRole.js';

const router = Router();

router.post('/api/sales', VerifyFirebaseToken, CheckLicense, RequireRole(['admin']), SalesController.create);

export default router;

import { Router } from 'express';
import * as CustomerController from '../controllers/CustomerController.js';
import VerifyFirebaseToken from '../middlewares/VerifyFirebaseToken.js';
import CheckLicense from '../middlewares/CheckLicense.js';
import RequireRole from '../middlewares/RequireRole.js';

const router = Router();

router.get('/api/customers', VerifyFirebaseToken, CheckLicense, RequireRole(['admin']), CustomerController.list);
router.post('/api/customers', VerifyFirebaseToken, CheckLicense, RequireRole(['admin']), CustomerController.create);

export default router;

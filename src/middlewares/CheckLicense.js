import * as LicenseService from '../services/LicenseService.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export default async function CheckLicense(req, res, next) {
  // Dev-only escape hatch — see docs/06_LICENSING_SPEC.md. Guarded by NODE_ENV
  // to ensure this flag can never be used in production, even if the environment
  // variables are copied incorrectly.
  if (process.env.DISABLE_LICENSE_CHECK === 'true' && process.env.NODE_ENV !== 'production') {
    return next();
  }

  if (req.user?.isVendor) {
    return next();
  }

  const license = await LicenseService.getStatus(req.user.branchId);
  const isActive = license && license.status === 'active' && (!license.expiresAt || new Date(license.expiresAt) > new Date());

  if (isActive) {
    return next();
  }

  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  return res.status(403).json({
    error: 'LICENSE_EXPIRED',
    message: 'Masa aktif lisensi aplikasi telah habis. Silakan perpanjang lisensi untuk kembali menggunakan seluruh fitur.',
  });
}

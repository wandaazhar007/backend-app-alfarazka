export default function RequireRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: `Role '${req.user?.role}' tidak diizinkan mengakses endpoint ini.`,
      });
    }

    next();
  };
}

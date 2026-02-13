import jwt from 'jsonwebtoken';

export const authMiddleware = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Token não fornecido' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido' });
  }
};

export const checkPlan = (requiredPlan) => {
  const planLevels = { basico: 1, profissional: 2, premium: 3 };
  
  return (req, res, next) => {
    const userPlanLevel = planLevels[req.user.plan] || 0;
    const requiredLevel = planLevels[requiredPlan] || 999;

    if (userPlanLevel < requiredLevel) {
      return res.status(403).json({ 
        error: 'Plano insuficiente',
        message: `Esta funcionalidade requer o plano ${requiredPlan} ou superior` 
      });
    }

    next();
  };
};

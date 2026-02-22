import { ZodError } from 'zod';

/**
 * Middleware de validação genérico usando Zod.
 * Aceita um objeto com schemas para body, query e params.
 */
export const validate = (schemas) => {
    return (req, res, next) => {
        try {
            if (schemas.body) {
                req.body = schemas.body.parse(req.body);
            }
            if (schemas.query) {
                req.query = schemas.query.parse(req.query);
            }
            if (schemas.params) {
                req.params = schemas.params.parse(req.params);
            }
            next();
        } catch (error) {
            if (error instanceof ZodError) {
                const messages = error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
                return res.status(400).json({
                    error: 'Dados inválidos',
                    details: messages
                });
            }
            next(error);
        }
    };
};

/**
 * Middleware de validação genérico usando Zod.
 * Aceita um objeto com schemas para body, query e params.
 * Erros de validação são encaminhados para o errorHandler global.
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
            // ZodError é tratado pelo errorHandler global
            next(error);
        }
    };
};

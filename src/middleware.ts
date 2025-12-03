import { defineMiddleware } from 'astro:middleware';

export const onRequest = defineMiddleware(async (context, next) => {
  const response = await next();
  
  if (response.status === 404) {
    // Rewrite to 404 page while keeping original URL
    return context.rewrite('/404');
  }
  
  return response;
});
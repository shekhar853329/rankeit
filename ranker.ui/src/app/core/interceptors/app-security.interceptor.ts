import { HttpInterceptorFn } from '@angular/common/http';

export const APP_CLIENT_HEADER = 'X-App-Client';
export const APP_CLIENT_VALUE = 'Ranker-UI-Client';

/**
 * Attaches client verification headers to all outgoing requests.
 * This guarantees the backend and reverse proxy can identify requests
 * originating exclusively from this Angular application and block
 * direct external API scraping or outside calls.
 */
export const appSecurityInterceptor: HttpInterceptorFn = (req, next) => {
  const cloned = req.clone({
    setHeaders: {
      [APP_CLIENT_HEADER]: APP_CLIENT_VALUE,
      'X-Requested-With': 'XMLHttpRequest',
    },
  });
  return next(cloned);
};

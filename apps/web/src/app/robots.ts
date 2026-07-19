import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:5174';
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/buscar', '/entrar', '/api/'],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}

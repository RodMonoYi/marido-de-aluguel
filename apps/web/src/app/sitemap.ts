import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:5174';
  const paths = ['', '/como-funciona', '/seguranca', '/privacidade', '/termos'];
  return paths.map((path) => ({
    url: `${baseUrl}${path}`,
    lastModified: new Date('2026-07-18T00:00:00.000Z'),
    changeFrequency: path === '' ? 'weekly' : 'monthly',
    priority: path === '' ? 1 : 0.5,
  }));
}

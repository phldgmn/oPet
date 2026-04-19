import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { secureHeaders } from 'hono/secure-headers'
import { serveStatic } from 'hono/bun'
import { publicRoutes } from './routes/public.js'
import { adminRoutes } from './routes/admin.js'
import { t } from './lib/i18n.js'

const app = new Hono()

app.use('*', logger())
app.use('*', secureHeaders())
app.use('*', cors({
  origin: process.env.APP_URL || 'http://localhost:3000',
  credentials: true,
}))
app.use('/uploads/*', serveStatic({ root: './' }))

app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }))

app.route('/api', publicRoutes)
app.route('/api/admin', adminRoutes)

app.onError((err, c) => {
  console.error(err)
  return c.json({ error: t(c, 'api.internal_server_error') }, 500)
})

const port = parseInt(process.env.PORT || '3001')
console.log(`Server starting on port ${port}`)

export default {
  port,
  fetch: app.fetch,
}

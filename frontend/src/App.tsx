import { Router, Route } from '@solidjs/router'
import { lazy } from 'solid-js'
import Layout from './components/Layout.js'
import AdminLayout from './components/AdminLayout.js'

const Home = lazy(() => import('./pages/Home.js'))
const PetitionPage = lazy(() => import('./pages/PetitionPage.js'))
const SuccessPage = lazy(() => import('./pages/SuccessPage.js'))
const VerifyPage = lazy(() => import('./pages/VerifyPage.js'))
const WithdrawPage = lazy(() => import('./pages/WithdrawPage.js'))
const PrivacyPage = lazy(() => import('./pages/PrivacyPage.js'))
const ImprintPage = lazy(() => import('./pages/ImprintPage.js'))

const AdminIndexPage = lazy(() => import('./pages/admin/index.js'))
const AdminLoginPage = lazy(() => import('./pages/admin/LoginPage.js'))
const AdminDashboardPage = lazy(() => import('./pages/admin/DashboardPage.js'))
const AdminPetitionsPage = lazy(() => import('./pages/admin/PetitionsPage.js'))
const AdminPetitionEditorPage = lazy(() => import('./pages/admin/PetitionEditorPage.js'))
const AdminPetitionUpdatesPage = lazy(() => import('./pages/admin/PetitionUpdatesPage.js'))
const AdminSignaturesPage = lazy(() => import('./pages/admin/SignaturesPage.js'))
const AdminExportPage = lazy(() => import('./pages/admin/ExportPage.js'))
const AdminBackupPage = lazy(() => import('./pages/admin/BackupPage.js'))
const AdminUsersPage = lazy(() => import('./pages/admin/UsersPage.js'))
const AdminSiteSettingsPage = lazy(() => import('./pages/admin/SiteSettingsPage.js'))
const AdminNewsRadarPage = lazy(() => import('./pages/admin/NewsRadarPage.js'))

export default function App() {
  return (
    <Router>
      <Route path="/" component={Layout}>
        <Route path="/" component={Home} />
        <Route path="/petition/:slug" component={PetitionPage} />
        <Route path="/petition/:slug/success" component={SuccessPage} />
        <Route path="/verify/:token" component={VerifyPage} />
        <Route path="/withdraw/:token" component={WithdrawPage} />
        <Route path="/privacy" component={PrivacyPage} />
        <Route path="/imprint" component={ImprintPage} />
      </Route>
      <Route path="/admin/login" component={AdminLoginPage} />
      <Route path="/admin" component={AdminLayout}>
        <Route path="/" component={AdminIndexPage} />
        <Route path="/dashboard" component={AdminDashboardPage} />
        <Route path="/petitions" component={AdminPetitionsPage} />
        <Route path="/petitions/new" component={AdminPetitionEditorPage} />
        <Route path="/petitions/:id/edit" component={AdminPetitionEditorPage} />
        <Route path="/petitions/:id/updates" component={AdminPetitionUpdatesPage} />
        <Route path="/petitions/:id/signatures" component={AdminSignaturesPage} />
        <Route path="/export" component={AdminExportPage} />
        <Route path="/backup" component={AdminBackupPage} />
        <Route path="/users" component={AdminUsersPage} />
        <Route path="/settings" component={AdminSiteSettingsPage} />
        <Route path="/news" component={AdminNewsRadarPage} />
      </Route>
    </Router>
  )
}

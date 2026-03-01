import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './components/Dashboard'
import ContentFramework from './components/ContentFramework'
import ContentAnalyzer from './components/ContentAnalyzer'
import FAQGenerator from './components/FAQGenerator'
import ThreadFinder from './components/ThreadFinder'
import FanoutGenerator from './components/FanoutGenerator'
import Articles from './components/Articles'
import EmailMarketing from './components/EmailMarketing'
import SettingsPanel from './components/SettingsPanel'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="framework" element={<ContentFramework />} />
        <Route path="analyzer" element={<ContentAnalyzer />} />
        <Route path="faq-generator" element={<FAQGenerator />} />
        <Route path="thread-finder" element={<ThreadFinder />} />
        <Route path="fanout" element={<FanoutGenerator />} />
        <Route path="articles" element={<Articles />} />
        <Route path="email" element={<EmailMarketing />} />
        <Route path="settings" element={<SettingsPanel />} />
      </Route>
    </Routes>
  )
}

export default App

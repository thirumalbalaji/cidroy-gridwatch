import React from 'react';
import { useKeycloak } from './KeycloakContext';
import Dashboard from './components/Dashboard';

function App() {
  const { authenticated, logout, operatorId } = useKeycloak();

  if (!authenticated) {
    return (
      <div style={{ padding: 20 }}>
        <h2>Authentication Required</h2>
        <p>You must log in to view this application.</p>
      </div>
    );
  }

  return (
    <>
      <header>
        <h1>GridWatch Operations</h1>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ fontSize: 13 }}>Logged in as {operatorId || 'Unknown Operator'}</span>
          <a className="link-button secondary" href="http://localhost:3000/docs" target="_blank" rel="noreferrer">Open API Docs</a>
          <button className="secondary" onClick={logout}>Logout</button>
        </div>
      </header>
      <main>
        <Dashboard />
      </main>
    </>
  );
}

export default App;

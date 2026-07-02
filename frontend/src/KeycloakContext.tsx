import React, { createContext, useContext, useEffect, useState } from 'react';
import Keycloak from 'keycloak-js';

export const keycloak = new Keycloak({
  url: 'http://localhost:8080',
  realm: 'gridwatch',
  clientId: 'gridwatch-frontend'
});

interface KeycloakContextType {
  authenticated: boolean;
  token?: string;
  login: () => void;
  logout: () => void;
  operatorId?: string;
}

const KeycloakContext = createContext<KeycloakContextType>({
  authenticated: false,
  login: () => {},
  logout: () => {},
});

export const KeycloakProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [authenticated, setAuthenticated] = useState<boolean>(false);
  const [token, setToken] = useState<string | undefined>(undefined);
  const [operatorId, setOperatorId] = useState<string | undefined>(undefined);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    keycloak.init({ onLoad: 'login-required', checkLoginIframe: false })
      .then(auth => {
        setAuthenticated(auth);
        setInitialized(true);
        if (auth) {
          setToken(keycloak.token);
          // Extract operator_id from the token
          const tokenParsed = keycloak.tokenParsed as any;
          if (tokenParsed?.operator_id) {
            setOperatorId(tokenParsed.operator_id);
          }
        }
      })
      .catch(console.error);

    keycloak.onTokenExpired = () => {
      keycloak.updateToken(30).then(refreshed => {
        if (refreshed) {
          setToken(keycloak.token);
        }
      }).catch(() => {
        keycloak.login();
      });
    };
  }, []);

  if (!initialized) {
    return <div style={{ padding: 20 }}>Loading authentication...</div>;
  }

  return (
    <KeycloakContext.Provider value={{
      authenticated,
      token,
      login: () => keycloak.login(),
      logout: () => keycloak.logout(),
      operatorId
    }}>
      {children}
    </KeycloakContext.Provider>
  );
};

export const useKeycloak = () => useContext(KeycloakContext);

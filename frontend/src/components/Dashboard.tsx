import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import { useKeycloak } from '../KeycloakContext';

const API_BASE = 'http://localhost:3000';

export default function Dashboard() {
  const { token, operatorId } = useKeycloak();
  const [sites, setSites] = useState<any[]>([]);
  const [nearest, setNearest] = useState<any[]>([]);
  const [query, setQuery] = useState({ lat: 28.57, lng: 77.32 });
  const [latInput, setLatInput] = useState('28.57');
  const [lngInput, setLngInput] = useState('77.32');
  const [lastLoaded, setLastLoaded] = useState<string>('Not loaded');
  const [ingestOutput, setIngestOutput] = useState<any>({});

  const axiosInstance = React.useMemo(() => axios.create({
    baseURL: API_BASE,
    headers: {
      Authorization: `Bearer ${token}`
    }
  }), [token]);

  const loadStatus = useCallback(async () => {
    try {
      const res = await axiosInstance.get(`/sites/status-rollup?operator_id=${operatorId || ''}`);
      setSites(res.data);
      setLastLoaded(new Date().toLocaleTimeString());
    } catch (err: any) {
      setIngestOutput({ error: err.message, response: err.response?.data });
    }
  }, [axiosInstance, operatorId]);

  const loadHealth = async () => {
    try {
      const res = await axiosInstance.get('/health');
      setIngestOutput(res.data);
    } catch (err: any) {
      setIngestOutput({ error: err.message });
    }
  };

  const findNearest = async () => {
    const lat = Number(latInput);
    const lng = Number(lngInput);
    setQuery({ lat, lng });
    try {
      const res = await axiosInstance.get(`/chargers/nearest?lat=${lat}&lng=${lng}&limit=5&operator_id=${operatorId || ''}`);
      setNearest(res.data);
    } catch (err: any) {
      setIngestOutput({ error: err.message, response: err.response?.data });
    }
  };

  const replay = async (name: string) => {
    const fixtures: any = {
      poll: {
        url: "/ingest/poll-page",
        body: {
          events: [
            { type: "status", charger_id: "C-IN-0007-A", connector_id: "1", status: "Charging", ts: new Date().toISOString() },
          ]
        }
      }
    };
    const fix = fixtures[name] || fixtures.poll;
    try {
      const res = await axiosInstance.post(fix.url, fix.body);
      setIngestOutput(res.data);
      loadStatus();
    } catch (err: any) {
      setIngestOutput({ error: err.message, response: err.response?.data });
    }
  };

  useEffect(() => {
    loadStatus();
    findNearest();

    const socket = io(API_BASE);
    socket.on('connector_update', (data) => {
      console.log('Real-time update:', data);
      // For simplicity, just reload the status
      loadStatus();
    });

    return () => {
      socket.disconnect();
    };
  }, [loadStatus]); // Note: loadStatus is wrapped in useCallback

  const siteCount = sites.length;
  const availableCount = sites.reduce((sum, site) => sum + Number(site.available_count || 0), 0);
  const faultedCount = sites.reduce((sum, site) => sum + Number(site.faulted_count || 0), 0);

  // Map rendering logic simplified for React
  const renderMap = () => {
    const points = sites.filter(s => Number.isFinite(Number(s.lat)) && Number.isFinite(Number(s.lng)));
    const allLats = [...points.map(s => Number(s.lat)), query.lat];
    const allLngs = [...points.map(s => Number(s.lng)), query.lng];
    const minLat = Math.min(...allLats);
    const maxLat = Math.max(...allLats);
    const minLng = Math.min(...allLngs);
    const maxLng = Math.max(...allLngs);
    const pad = 8;

    const project = (lat: number, lng: number) => {
      const x = maxLng === minLng ? 50 : pad + ((lng - minLng) / (maxLng - minLng)) * (100 - pad * 2);
      const y = maxLat === minLat ? 50 : pad + ((maxLat - lat) / (maxLat - minLat)) * (100 - pad * 2);
      return { x, y };
    };

    const q = project(query.lat, query.lng);

    return (
      <div className="map">
        {points.map((site, i) => {
          const p = project(Number(site.lat), Number(site.lng));
          const statusClass = site.site_status === "Faulted" ? "Faulted" : (Number(site.available_count || 0) > 0 ? "Available" : site.site_status);
          return (
            <React.Fragment key={site.site_id}>
              <button className={`map-point ${statusClass}`} style={{ left: `${p.x}%`, top: `${p.y}%` }} title={site.name}></button>
              <div className="map-label" style={{ left: `${p.x}%`, top: `${p.y}%` }}>
                <strong>{site.name}</strong>
                <span>{site.site_status} - {site.connector_count || 0} connectors</span>
              </div>
            </React.Fragment>
          );
        })}
        <div className="query-point" style={{ left: `${q.x}%`, top: `${q.y}%` }} title="Query point"></div>
      </div>
    );
  };

  const nearestSummary = nearest.length > 0 ? nearest[0] : null;

  return (
    <>
      <section className="toolbar">
        <label>
          Operator (from Token)
          <input readOnly value={operatorId || 'Unknown'} style={{ background: '#f0f0f0', color: '#666' }} />
        </label>
        <button id="refreshButton" onClick={loadStatus}>Refresh</button>
        <button className="secondary" id="healthButton" onClick={loadHealth}>Health</button>
      </section>

      <section className="grid">
        <div className="stack">
          <section className="panel">
            <div className="panel-head">
              <h2>Site Status</h2>
              <span className="muted" id="lastLoaded">{lastLoaded}</span>
            </div>
            <div className="metric-row">
              <div className="metric"><strong>{siteCount}</strong><span>Sites</span></div>
              <div className="metric"><strong>{availableCount}</strong><span>Available connectors</span></div>
              <div className="metric"><strong>{faultedCount}</strong><span>Faulted connectors</span></div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Site</th>
                  <th>Status</th>
                  <th>Connectors</th>
                  <th>Latest event</th>
                </tr>
              </thead>
              <tbody>
                {sites.map(site => (
                  <tr key={site.site_id}>
                    <td><strong>{site.name}</strong><br /><span className="muted">{site.site_id}</span></td>
                    <td>
                      <span className={`status ${site.site_status}`}>
                        <span className="dot"></span>{site.site_status}
                      </span>
                    </td>
                    <td>{site.connector_count || 0} total<br /><span className="muted">{site.available_count || 0} available, {site.faulted_count || 0} faulted</span></td>
                    <td>{site.latest_event_ts ? new Date(site.latest_event_ts).toLocaleString() : "none"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>Map Preview</h2>
              <span className="muted">Live state + GIS query</span>
            </div>
            <div className="map-wrap">
              {renderMap()}
              <aside className="map-aside">
                <div className="legend">
                  <div className="legend-item"><span className="legend-dot available"></span>Available connector</div>
                  <div className="legend-item"><span className="legend-dot faulted"></span>Faulted site</div>
                  <div className="legend-item"><span className="legend-dot query"></span>Search point</div>
                </div>
                <div className="nearest-summary">
                  {nearestSummary ? (
                    <>
                      <span className="muted">Nearest result</span>
                      <strong>{nearestSummary.site_name}</strong>
                      <span>{nearestSummary.charger_id} / connector {nearestSummary.connector_id}</span>
                      <span>{Number(nearestSummary.distance_m || 0).toLocaleString()} m from query point</span>
                    </>
                  ) : (
                    <>
                      <span className="muted">Nearest result</span>
                      <strong>Run a query</strong>
                    </>
                  )}
                </div>
              </aside>
            </div>
          </section>
        </div>

        <div className="stack">
          <section className="panel">
            <h2>Nearest Available</h2>
            <label>
              Latitude
              <input value={latInput} onChange={e => setLatInput(e.target.value)} />
            </label>
            <label>
              Longitude
              <input value={lngInput} onChange={e => setLngInput(e.target.value)} />
            </label>
            <button onClick={findNearest}>Find</button>
            <pre>{JSON.stringify(nearest, null, 2)}</pre>
          </section>

          <section className="panel">
            <h2>CSMS Replay</h2>
            <div className="actions">
              <button className="secondary" onClick={() => replay('poll')}>Poll page</button>
            </div>
            <pre>{JSON.stringify(ingestOutput, null, 2)}</pre>
          </section>
        </div>
      </section>
    </>
  );
}

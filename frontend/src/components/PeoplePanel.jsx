import React, { useEffect, useState } from 'react';
import useStore from '../store';
import './PeoplePanel.css';

export default function PeoplePanel() {
  const { drivers, customers, vehicles, orders, fetchDrivers, fetchCustomers } = useStore();
  const [tab, setTab] = useState('drivers');

  useEffect(() => {
    fetchDrivers();
    fetchCustomers();
  }, [fetchDrivers, fetchCustomers]);

  const people = tab === 'drivers' ? drivers : customers;
  return (
    <section className="people-panel">
      <div className="people-tabs" role="tablist" aria-label="Account type">
        <button className={tab === 'drivers' ? 'active' : ''} onClick={() => setTab('drivers')} role="tab" aria-selected={tab === 'drivers'}>
          Drivers <span>{drivers.length}</span>
        </button>
        <button className={tab === 'customers' ? 'active' : ''} onClick={() => setTab('customers')} role="tab" aria-selected={tab === 'customers'}>
          Customers <span>{customers.length}</span>
        </button>
      </div>
      <div className="people-list">
        {!people.length ? <div className="empty-state"><div className="empty-icon">♙</div><div className="text-secondary text-sm">No {tab} registered yet</div></div> :
          people.map(person => {
            const id = String(person._id);
            const vehicle = tab === 'drivers' ? vehicles.find(item => String(item.driver?._id || item.driverId || item.driver) === id) : null;
            const orderCount = tab === 'customers'
              ? orders.filter(order => String(order.customerId?._id || order.customerId || '') === id).length
              : orders.filter(order => String(order.assignedDriver?._id || order.assignedDriver || '') === id && !['delivered', 'failed', 'cancelled'].includes(order.status)).length;
            return (
              <article className="people-card glass-card-sm" key={id}>
                <div className="people-card-heading">
                  <div className={`people-avatar ${tab === 'drivers' ? 'driver' : 'customer'}`}>{person.name?.slice(0, 1).toUpperCase() || '?'}</div>
                  <div className="people-name"><strong>{person.name}</strong><small>{person.email}</small></div>
                </div>
                <div className="people-meta">
                  <span>{tab === 'drivers' ? vehicle?.vehicleId || 'No vehicle assigned' : `${orderCount} ${orderCount === 1 ? 'order' : 'orders'}`}</span>
                  {tab === 'drivers' && <span>{orderCount} assigned {orderCount === 1 ? 'stop' : 'stops'}</span>}
                </div>
              </article>
            );
          })}
      </div>
    </section>
  );
}

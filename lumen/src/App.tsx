import Lumen from './Lumen';

export default function App() {
  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100%',
        background: '#08090A',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Lumen />
    </div>
  );
}

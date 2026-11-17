import React, { useState } from 'react';
import { ActivityIndicator, Image, Text, TouchableOpacity, View } from 'react-native';

/** Uses the same image service as the existing shelf-label screen. */
export default function ProductQrCode({ value, size = 200 }: { value: string; size?: number }) {
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const pixels = Math.max(100, Math.round(size - 20));
  const uri = `https://api.qrserver.com/v1/create-qr-code/?size=${pixels}x${pixels}&data=${encodeURIComponent(value)}&bgcolor=ffffff&color=000000`;
  return <View style={{ width: size, minHeight: size, padding: 10, backgroundColor: '#ffffff', borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}>
    {!value ? <Text style={{ color: '#111111' }}>No barcode recorded.</Text> : failed ? <>
      <Text style={{ color: '#111111', textAlign: 'center' }}>QR image unavailable. Check your connection and retry.</Text>
      <TouchableOpacity accessibilityRole="button" onPress={() => { setFailed(false); setLoading(true); setAttempt(n => n + 1); }} style={{ padding: 12 }}>
        <Text style={{ color: '#075eb5', fontWeight: '600' }}>Retry QR image</Text>
      </TouchableOpacity>
      <Text selectable style={{ color: '#111111' }}>{value}</Text>
    </> : <>
      <Image key={`${value}-${attempt}`} source={{ uri }} resizeMode="contain"
        accessibilityLabel={`QR code for ${value}`}
        style={{ width: pixels, height: pixels }}
        onLoad={() => setLoading(false)} onError={() => { setLoading(false); setFailed(true); }} />
      {loading && <ActivityIndicator color="#075eb5" style={{ position: 'absolute' }} />}
    </>}
  </View>;
}

import { router } from 'expo-router';
import { useState } from 'react';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { FarmerList } from '@/components/FarmerList';
import { TabScreen } from '@/components/TabScreen';
import { TextField } from '@/components/TextField';

/** The design's Farmers screen (field-app/Farmers): searchable list and "Add farmer". Tap a farmer to open their profile. */
export default function Farmers() {
  const [search, setSearch] = useState('');
  return (
    <TabScreen>
      <AppText variant="title">Farmers</AppText>
      <Button label="Add farmer" onPress={() => router.push('/field/farmers/new')} />
      <TextField label="Search farmers" value={search} onChangeText={setSearch} placeholder="Search by name" />
      <FarmerList search={search} onSelect={(id) => router.push({ pathname: '/field/farmers/[id]', params: { id } })} />
    </TabScreen>
  );
}

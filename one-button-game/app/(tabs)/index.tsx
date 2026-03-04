import GravityFlux from '@/components/GravityFlux';
import { StyleSheet, View } from 'react-native';

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <GravityFlux />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

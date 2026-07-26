import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

export default function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('');

  const handleLogin = () => {
    if (!username.trim() || !password) {
      setStatus('Introduce usuario y contraseña para continuar.');
      return;
    }

    setStatus(`Sesión preparada para ${username.trim()}.`);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.select({ ios: 'padding', default: undefined })}
      style={styles.screen}>
      <View style={styles.backgroundOrbit} />
      <View style={styles.backgroundGrid}>
        {Array.from({ length: 9 }).map((_, index) => (
          <View key={index} style={styles.gridLine} />
        ))}
      </View>

      <View style={styles.panel}>
        <View style={styles.logoLockup} accessibilityLabel="Logo de Desapliwe">
          <View style={styles.logoMark}>
            <View style={styles.logoCore}>
              <Text style={styles.logoLetter}>D</Text>
            </View>
            <View style={styles.logoRail} />
            <View style={styles.logoNode} />
          </View>
          <View>
            <Text style={styles.logoName}>desapliwe</Text>
            <Text style={styles.logoTagline}>Acceso al panel</Text>
          </View>
        </View>

        <View style={styles.copy}>
          <Text style={styles.eyebrow}>Entrada segura</Text>
          <Text style={styles.title}>Vuelve al tablero donde dejaste el trabajo.</Text>
          <Text style={styles.subtitle}>
            Identifícate con tu usuario para continuar con tu espacio de desarrollo.
          </Text>
        </View>

        <View style={styles.form}>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Usuario</Text>
            <TextInput
              accessibilityLabel="Usuario"
              autoCapitalize="none"
              autoCorrect={false}
              inputMode="text"
              onChangeText={setUsername}
              placeholder="tu.usuario"
              placeholderTextColor="#7C8799"
              returnKeyType="next"
              style={styles.input}
              value={username}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Contraseña</Text>
            <TextInput
              accessibilityLabel="Contraseña"
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor="#7C8799"
              returnKeyType="done"
              secureTextEntry
              style={styles.input}
              value={password}
            />
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={handleLogin}
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
            <Text style={styles.buttonText}>Entrar</Text>
          </Pressable>

          {status ? <Text style={styles.status}>{status}</Text> : null}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'center',
    overflow: 'hidden',
    padding: 24,
    backgroundColor: '#07111F',
  },
  backgroundOrbit: {
    position: 'absolute',
    top: -120,
    right: -120,
    width: 300,
    height: 300,
    borderRadius: 150,
    borderWidth: 42,
    borderColor: '#1AD7B333',
  },
  backgroundGrid: {
    position: 'absolute',
    left: 22,
    top: 44,
    bottom: 44,
    justifyContent: 'space-between',
  },
  gridLine: {
    width: 1,
    height: 34,
    backgroundColor: '#DCE8FF1A',
  },
  panel: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    gap: 30,
    padding: 28,
    borderRadius: 34,
    borderWidth: 1,
    borderColor: '#DCE8FF24',
    backgroundColor: '#F7FAFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.3,
    shadowRadius: 36,
    elevation: 18,
  },
  logoLockup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  logoMark: {
    width: 66,
    height: 66,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoCore: {
    width: 56,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 18,
    backgroundColor: '#0D1B2F',
    transform: [{ rotate: '-8deg' }],
  },
  logoLetter: {
    color: '#F7FAFF',
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -2,
  },
  logoRail: {
    position: 'absolute',
    right: 2,
    bottom: 8,
    width: 34,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#FFB84D',
    transform: [{ rotate: '-28deg' }],
  },
  logoNode: {
    position: 'absolute',
    right: 0,
    bottom: 5,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#1AD7B3',
  },
  logoName: {
    color: '#0D1B2F',
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -1,
    textTransform: 'lowercase',
  },
  logoTagline: {
    marginTop: 2,
    color: '#607089',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  copy: {
    gap: 10,
  },
  eyebrow: {
    color: '#0F8D7C',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  },
  title: {
    color: '#0D1B2F',
    fontSize: 34,
    fontWeight: '900',
    lineHeight: 38,
    letterSpacing: -1.4,
  },
  subtitle: {
    color: '#607089',
    fontSize: 16,
    lineHeight: 23,
  },
  form: {
    gap: 18,
  },
  fieldGroup: {
    gap: 8,
  },
  label: {
    color: '#26364D',
    fontSize: 14,
    fontWeight: '800',
  },
  input: {
    minHeight: 54,
    borderWidth: 1,
    borderColor: '#C8D5E8',
    borderRadius: 18,
    paddingHorizontal: 18,
    color: '#0D1B2F',
    backgroundColor: '#FFFFFF',
    fontSize: 16,
  },
  button: {
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: '#0D1B2F',
  },
  buttonPressed: {
    transform: [{ translateY: 1 }],
    backgroundColor: '#142944',
  },
  buttonText: {
    color: '#F7FAFF',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  status: {
    color: '#0F8D7C',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
});

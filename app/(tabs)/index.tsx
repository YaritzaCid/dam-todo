import MaterialIcons from '@expo/vector-icons/MaterialIcons';
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
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [status, setStatus] = useState('');

  const handleLogin = () => {
    if (!username.trim() || !password) {
      setStatus('Faltan piezas: introduce usuario y contraseña.');
      return;
    }

    setStatus(`Pieza colocada: ${username.trim()}.`);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.select({ ios: 'padding', default: undefined })}
      style={styles.screen}>
      <View style={styles.cornerPiece} />
      <View style={styles.floatingPiece} />
      <View style={styles.boardGrid}>
        {Array.from({ length: 10 }).map((_, index) => (
          <View key={index} style={styles.gridDot} />
        ))}
      </View>

      <View style={styles.panel}>
        <View style={styles.logoLockup} accessibilityLabel="Logo de Piezario">
          <View style={styles.logoMark}>
            <View style={[styles.puzzlePiece, styles.pieceA]}>
              <View style={[styles.puzzleKnob, styles.knobRight]} />
            </View>
            <View style={[styles.puzzlePiece, styles.pieceB]}>
              <View style={[styles.puzzleKnob, styles.knobBottom]} />
            </View>
            <View style={[styles.puzzlePiece, styles.pieceC]}>
              <View style={[styles.puzzleKnob, styles.knobTop]} />
            </View>
            <View style={[styles.puzzlePiece, styles.pieceD]}>
              <Text style={styles.logoLetter}>P</Text>
            </View>
          </View>
          <View>
            <Text style={styles.logoName}>Piezario</Text>
            <Text style={styles.logoTagline}>Cada pieza en su lugar</Text>
          </View>
        </View>

        <View style={styles.copy}>
          <Text style={styles.eyebrow}>Puzzle de acceso</Text>
          <Text style={styles.title}>Coloca tus piezas para entrar.</Text>
          <Text style={styles.subtitle}>
            Reúne usuario y contraseña para abrir tu tablero personal de Piezario.
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
              placeholderTextColor="#8D7B68"
              returnKeyType="next"
              style={styles.input}
              value={username}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Contraseña</Text>
            <View style={styles.passwordInputShell}>
              <TextInput
                accessibilityLabel="Contraseña"
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor="#8D7B68"
                returnKeyType="done"
                secureTextEntry={Platform.OS !== 'web' && !isPasswordVisible}
                style={[
                  styles.input,
                  styles.passwordInput,
                  Platform.OS === 'web' && !isPasswordVisible && styles.webPasswordHidden,
                ]}
                value={password}
              />
              <Pressable
                accessibilityLabel={isPasswordVisible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                accessibilityRole="button"
                onPress={() => setIsPasswordVisible((visible) => !visible)}
                style={({ pressed }) => [
                  styles.passwordToggle,
                  pressed && styles.passwordTogglePressed,
                ]}>
                <MaterialIcons
                  color="#5B4265"
                  name={isPasswordVisible ? 'visibility-off' : 'visibility'}
                  size={22}
                />
              </Pressable>
            </View>
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={handleLogin}
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
            <Text style={styles.buttonText}>Encajar piezas</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: true }}
            disabled
            style={styles.registerOption}>
            <View style={styles.registerPiece} />
            <View style={styles.registerCopy}>
              <Text style={styles.registerQuestion}>¿No tienes cuenta?</Text>
              <Text style={styles.registerAction}>Crear cuenta · Próximamente</Text>
            </View>
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
    backgroundColor: '#F6E8CF',
  },
  cornerPiece: {
    position: 'absolute',
    top: -72,
    right: -58,
    width: 190,
    height: 190,
    borderRadius: 42,
    backgroundColor: '#F2B84B',
    transform: [{ rotate: '18deg' }],
  },
  floatingPiece: {
    position: 'absolute',
    left: -46,
    bottom: 98,
    width: 118,
    height: 118,
    borderRadius: 30,
    backgroundColor: '#2DB7A3',
    transform: [{ rotate: '-14deg' }],
  },
  boardGrid: {
    position: 'absolute',
    left: 24,
    right: 24,
    top: 42,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  gridDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#5B426529',
  },
  panel: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    gap: 30,
    padding: 28,
    borderRadius: 32,
    borderWidth: 3,
    borderColor: '#3E2A46',
    backgroundColor: '#FFF9EC',
    shadowColor: '#3E2A46',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.22,
    shadowRadius: 28,
    elevation: 16,
  },
  logoLockup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  logoMark: {
    width: 72,
    height: 72,
    flexDirection: 'row',
    flexWrap: 'wrap',
    transform: [{ rotate: '-5deg' }],
  },
  puzzlePiece: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#3E2A46',
  },
  pieceA: {
    borderTopLeftRadius: 16,
    backgroundColor: '#E85D75',
  },
  pieceB: {
    borderTopRightRadius: 16,
    marginLeft: -1,
    backgroundColor: '#F2B84B',
  },
  pieceC: {
    borderBottomLeftRadius: 16,
    marginTop: -1,
    backgroundColor: '#2DB7A3',
  },
  pieceD: {
    borderBottomRightRadius: 16,
    marginTop: -1,
    marginLeft: -1,
    backgroundColor: '#5B4265',
  },
  puzzleKnob: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#3E2A46',
    backgroundColor: '#FFF9EC',
  },
  knobRight: {
    right: -9,
    top: 9,
  },
  knobBottom: {
    bottom: -9,
    left: 9,
  },
  knobTop: {
    top: -9,
    left: 9,
  },
  logoLetter: {
    color: '#FFF9EC',
    fontSize: 23,
    fontWeight: '900',
    letterSpacing: -1,
  },
  logoName: {
    color: '#3E2A46',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.7,
  },
  logoTagline: {
    marginTop: 2,
    color: '#8D4E5B',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  copy: {
    gap: 10,
  },
  eyebrow: {
    color: '#2B8F82',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  },
  title: {
    color: '#3E2A46',
    fontSize: 35,
    fontWeight: '900',
    lineHeight: 39,
    letterSpacing: -1.5,
  },
  subtitle: {
    color: '#6F5B4B',
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
    color: '#4B354F',
    fontSize: 14,
    fontWeight: '900',
  },
  input: {
    minHeight: 54,
    borderWidth: 2,
    borderColor: '#D6BE99',
    borderRadius: 16,
    paddingHorizontal: 18,
    color: '#3E2A46',
    backgroundColor: '#FFFDF7',
    fontSize: 16,
  },
  passwordInputShell: {
    position: 'relative',
  },
  passwordInput: {
    paddingRight: 56,
  },
  webPasswordHidden: {
    WebkitTextSecurity: 'disc',
  },
  passwordToggle: {
    position: 'absolute',
    right: 8,
    top: 7,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
  },
  passwordTogglePressed: {
    backgroundColor: '#F2E2C7',
  },
  button: {
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#3E2A46',
    backgroundColor: '#5B4265',
  },
  buttonPressed: {
    transform: [{ translateY: 2 }],
    backgroundColor: '#4A3553',
  },
  buttonText: {
    color: '#FFF9EC',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.1,
  },
  registerOption: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderWidth: 2,
    borderColor: '#D6BE99',
    borderStyle: 'dashed',
    borderRadius: 16,
    backgroundColor: '#FFFDF7',
    opacity: 0.78,
  },
  registerPiece: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#3E2A46',
    backgroundColor: '#F2B84B',
    transform: [{ rotate: '10deg' }],
  },
  registerCopy: {
    flex: 1,
    gap: 2,
  },
  registerQuestion: {
    color: '#6F5B4B',
    fontSize: 13,
    fontWeight: '800',
  },
  registerAction: {
    color: '#3E2A46',
    fontSize: 15,
    fontWeight: '900',
  },
  status: {
    color: '#2B8F82',
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
  },
});

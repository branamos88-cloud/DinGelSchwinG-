;; ============================================================================
;; bleDistance.wat — Echtes WebAssembly-Modul für BLE-Abstandsbestimmung
;; Semantik identisch zu wasm-ble/src/lib.rs (Pfadverlustmodell).
;;
;; Funktionen:
;;   calculate_distance(rssi, tx_power)            -> d  (n = 2.0 Freifeld)
;;   calculate_distance_env(rssi, tx_power, n)    -> d  (einstellbarer Faktor)
;;   calc_exact_distance(rssi, tx, rssi_ref, dist_ref) -> kalibrierte Distanz
;;   batch_distances(ptr, len, tx_power, out_ptr) -> schreibt len f64-Ergebnisse
;;   learn_from_feedback(rssi_ref, dist_ref, rssi_new, dist_new) -> neues n
;;   get_learned_n()                              -> gelernter Umgebungsfaktor
;;
;; Mathe-Basis: eigene ln/exp/pow10/log10-Implementierungen in f64
;; (Kein Import nötig — Modul ist vollständig eigenständig.)
;; ============================================================================
(module
  ;; Gelernter Umgebungsfaktor n (echter, persistenter Modul-Zustand).
  ;; Wird durch learn_from_feedback aktualisiert, Default 2.0 (Freifeld).
  (global $learned_n (mut f64) (f64.const 2.0))

  (memory (export "memory") 16)

  ;; --------------------------------------------------------------------------
  ;; Konstanten
  ;; --------------------------------------------------------------------------
  (global $ln2_hi f64 (f64.const 0.69314718055994530942))
  (global $ln2_lo f64 (f64.const 1.90821492927058770002e-10))
  (global $log2e  f64 (f64.const 1.44269504088896340736))
  (global $log10e f64 (f64.const 0.43429448190325182765))
  (global $ln10   f64 (f64.const 2.30258509299404568402))
  (global $sqrt2  f64 (f64.const 1.41421356237309504880))
  (global $inf    f64 (f64.const inf))

  ;; --------------------------------------------------------------------------
  ;; exp(x) — Taylor-Polynom nach Bereichsreduktion k = round(x * log2(e))
  ;; --------------------------------------------------------------------------
  (func $exp (param $x f64) (result f64)
    (local $k i64)
    (local $r f64)
    (local $acc f64)
    ;; Große Werte absichern (robust, im Pfadverlust-Modell nie nötig):
    (if (f64.gt (local.get $x) (f64.const 709.0)) (then
      (return (global.get $inf))))
    (if (f64.lt (local.get $x) (f64.const -745.0)) (then
      (return (f64.const 0.0))))
    ;; k = round(x * log2(e))
    (local.set $k
      (i64.trunc_f64_s
        (f64.nearest
          (f64.mul (local.get $x) (global.get $log2e)))))
    ;; r = x - k*ln2_hi - k*ln2_lo
    (local.set $r
      (f64.sub
        (f64.sub
          (local.get $x)
          (f64.mul (f64.convert_i64_s (local.get $k)) (global.get $ln2_hi)))
        (f64.mul (f64.convert_i64_s (local.get $k)) (global.get $ln2_lo))))
    ;; Horner-Taylor exp(r), |r| <= ln2/2 ≈ 0.347, Fehler < 1e-11
    (local.set $acc (f64.const 2.755731922398589e-6))     ;; 1/9!
    (local.set $acc (f64.add (f64.const 2.4801587301587302e-5) (f64.mul (local.get $acc) (local.get $r)))) ;; 1/8!
    (local.set $acc (f64.add (f64.const 1.984126984126984e-4) (f64.mul (local.get $acc) (local.get $r)))) ;; 1/7!
    (local.set $acc (f64.add (f64.const 1.388888888888889e-3) (f64.mul (local.get $acc) (local.get $r)))) ;; 1/6!
    (local.set $acc (f64.add (f64.const 8.333333333333333e-3) (f64.mul (local.get $acc) (local.get $r)))) ;; 1/5!
    (local.set $acc (f64.add (f64.const 4.166666666666666e-2) (f64.mul (local.get $acc) (local.get $r)))) ;; 1/4!
    (local.set $acc (f64.add (f64.const 1.6666666666666667e-1) (f64.mul (local.get $acc) (local.get $r)))) ;; 1/3!
    (local.set $acc (f64.add (f64.const 0.5) (f64.mul (local.get $acc) (local.get $r)))) ;; 1/2!
    (local.set $acc (f64.add (f64.const 1.0) (f64.mul (local.get $acc) (local.get $r)))) ;; 1/1!
    ;; Letzter Schritt: exp(r) = 1 + r * acc
    (local.set $acc (f64.add (f64.const 1.0) (f64.mul (local.get $r) (local.get $acc))))
    ;; Skalierung mit 2^k über Exponenten-Bits
    (f64.reinterpret_i64
      (i64.add
        (i64.reinterpret_f64 (local.get $acc))
        (i64.shl (local.get $k) (i64.const 52)))))

  ;; --------------------------------------------------------------------------
  ;; ln(x) für x > 0 — Bereichsreduktion x = m * 2^e, m in [sqrt2/2, sqrt2)
  ;; z = (m-1)/(m+1), ln(m) = 2*(z + z³/3 + z⁵/5 + …), |z| <= 0.1716
  ;; --------------------------------------------------------------------------
  (func $ln (param $x f64) (result f64)
    (local $bits i64)
    (local $e f64)
    (local $m f64)
    (local $z f64)
    (local $z2 f64)
    (local $acc f64)
    (if (f64.le (local.get $x) (f64.const 0.0)) (then
      (return (f64.neg (global.get $inf)))))
    (local.set $bits (i64.reinterpret_f64 (local.get $x)))
    ;; e = exponent - 1023
    (local.set $e
      (f64.convert_i64_s
        (i64.sub
          (i64.and (i64.shr_u (local.get $bits) (i64.const 52)) (i64.const 0x7ff))
          (i64.const 1023))))
    ;; m in [1, 2)
    (local.set $m
      (f64.reinterpret_i64
        (i64.or
          (i64.and (local.get $bits) (i64.const 0x000fffffffffffff))
          (i64.const 0x3ff0000000000000))))
    ;; Falls m > sqrt2: halbieren, Exponent +1
    (if (f64.gt (local.get $m) (global.get $sqrt2)) (then
      (local.set $m (f64.mul (local.get $m) (f64.const 0.5)))
      (local.set $e (f64.add (local.get $e) (f64.const 1.0)))))
    ;; z = (m-1)/(m+1)
    (local.set $z
      (f64.div
        (f64.sub (local.get $m) (f64.const 1.0))
        (f64.add (local.get $m) (f64.const 1.0))))
    (local.set $z2 (f64.mul (local.get $z) (local.get $z)))
    ;; Horner: s = z * (2 + z2*(2/3 + z2*(2/5 + … + z2*(2/15))))
    (local.set $acc (f64.const 0.13333333333333333333))  ;; 2/15
    (local.set $acc (f64.add (f64.const 0.15384615384615384615) (f64.mul (local.get $z2) (local.get $acc)))) ;; 2/13
    (local.set $acc (f64.add (f64.const 0.18181818181818181818) (f64.mul (local.get $z2) (local.get $acc)))) ;; 2/11
    (local.set $acc (f64.add (f64.const 0.22222222222222222222) (f64.mul (local.get $z2) (local.get $acc)))) ;; 2/9
    (local.set $acc (f64.add (f64.const 0.28571428571428571429) (f64.mul (local.get $z2) (local.get $acc)))) ;; 2/7
    (local.set $acc (f64.add (f64.const 0.4) (f64.mul (local.get $z2) (local.get $acc)))) ;; 2/5
    (local.set $acc (f64.add (f64.const 0.66666666666666666667) (f64.mul (local.get $z2) (local.get $acc)))) ;; 2/3
    (local.set $acc (f64.add (f64.const 2.0) (f64.mul (local.get $z2) (local.get $acc)))) ;; d1
    ;; ln(x) = z * acc + e * ln2  (acc enthält bereits den Faktor 2 der Reihe)
    (f64.add
      (f64.mul (local.get $z) (local.get $acc))
      (f64.mul (local.get $e) (global.get $ln2_hi))))

  ;; pow10(x) = exp(x * ln10)
  (func $pow10 (param $x f64) (result f64)
    (call $exp (f64.mul (local.get $x) (global.get $ln10))))

  ;; log10(x) = ln(x) * log10(e)
  (func $log10 (param $x f64) (result f64)
    (f64.mul (call $ln (local.get $x)) (global.get $log10e)))

  ;; --------------------------------------------------------------------------
  ;; Pfadverlustmodell: d = 10^((tx_power - rssi) / (10 * n))
  ;; --------------------------------------------------------------------------
  (func $path_loss (param $rssi f64) (param $tx f64) (param $n f64) (result f64)
    (call $pow10
      (f64.div
        (f64.sub (local.get $tx) (local.get $rssi))
        (f64.mul (f64.const 10.0) (local.get $n)))))

  ;; --------------------------------------------------------------------------
  ;; Exportierte API
  ;; --------------------------------------------------------------------------
  (func (export "calculate_distance") (param $rssi f64) (param $tx f64) (result f64)
    (call $path_loss (local.get $rssi) (local.get $tx) (f64.const 2.0)))

  (func (export "calculate_distance_env") (param $rssi f64) (param $tx f64) (param $n f64) (result f64)
    (call $path_loss (local.get $rssi) (local.get $tx) (local.get $n)))

  (func (export "calc_exact_distance")
    (param $rssi f64) (param $tx f64) (param $rssi_ref f64) (param $dist_ref f64)
    (result f64)
    (local $d_est f64)
    (local $d_ref_est f64)
    (if (f64.lt
          (f64.abs (f64.sub (local.get $rssi) (local.get $rssi_ref)))
          (f64.const 0.001))
      (then (return (local.get $dist_ref))))
    (local.set $d_est (call $path_loss (local.get $rssi) (local.get $tx) (f64.const 2.0)))
    (local.set $d_ref_est (call $path_loss (local.get $rssi_ref) (local.get $tx) (f64.const 2.0)))
    (f64.mul
      (local.get $d_est)
      (f64.div (local.get $dist_ref) (local.get $d_ref_est))))

  ;; batch_distances(rssi_ptr, len, tx_power, out_ptr)
  ;; Liest len f64-Werte ab rssi_ptr, schreibt Ergebnisse ab out_ptr.
  (func (export "batch_distances")
    (param $ptr i32) (param $len i32) (param $tx f64) (param $out i32)
    (local $i i32)
    (block $done
      (loop $loop
        (br_if $done (i32.ge_u (local.get $i) (local.get $len)))
        (f64.store
          (i32.add (local.get $out) (i32.mul (local.get $i) (i32.const 8)))
          (call $path_loss
            (f64.load (i32.add (local.get $ptr) (i32.mul (local.get $i) (i32.const 8))))
            (local.get $tx)
            (f64.const 2.0)))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $loop))))

  ;; learn_from_feedback — rekursiver Lernmechanismus mit echtem Modul-Zustand.
  ;; n = (rssi_ref - rssi_new) / (10 * log10(dist_new / dist_ref)), begrenzt 1.5–6.0
  (func (export "learn_from_feedback")
    (param $rssi_ref f64) (param $dist_ref f64) (param $rssi_new f64) (param $dist_new f64)
    (result f64)
    (local $ratio f64)
    (local $n f64)
    ;; Ungültige Eingaben → Default 2.0, Zustand unverändert
    (if (i32.or
          (i32.or
            (f64.le (local.get $dist_ref) (f64.const 0.0))
            (f64.le (local.get $dist_new) (f64.const 0.0)))
          (f64.lt
            (f64.abs (f64.sub (local.get $rssi_ref) (local.get $rssi_new)))
            (f64.const 0.001)))
      (then (return (f64.const 2.0))))
    (local.set $ratio (f64.div (local.get $dist_new) (local.get $dist_ref)))
    (if (f64.le (local.get $ratio) (f64.const 0.0)) (then
      (return (f64.const 2.0))))
    (local.set $n
      (f64.div
        (f64.sub (local.get $rssi_ref) (local.get $rssi_new))
        (f64.mul (f64.const 10.0) (call $log10 (local.get $ratio)))))
    ;; Begrenzen auf realistische Umgebungswerte
    (if (f64.lt (local.get $n) (f64.const 1.5)) (then
      (local.set $n (f64.const 1.5))))
    (if (f64.gt (local.get $n) (f64.const 6.0)) (then
      (local.set $n (f64.const 6.0))))
    ;; Zustand persistieren
    (global.set $learned_n (local.get $n))
    (local.get $n))

  (func (export "get_learned_n") (result f64)
    (global.get $learned_n))
)

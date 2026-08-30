# 数学II

## 式と証明

### 高次式と分数式
- **3次式の展開**
    - $(a+b)^3 = a^3+3a^2b+3ab^2+b^3$
    - $(a-b)^3 = a^3-3a^2b+3ab^2-b^3$
    - $(a+b)(a^2-ab+b^2) = a^3+b^3$
    - $(a-b)(a^2+ab+b^2) = a^3-b^3$
- **3次式の因数分解**
    - $a^3+b^3 = (a+b)(a^2-ab+b^2)$
    - $a^3-b^3 = (a-b)(a^2+ab+b^2)$
- **二項定理**
    - $(a+b)^n = {}_nC_0a^n + {}_nC_1a^{n-1}b + \dots + {}_nC_ra^{n-r}b^r + \dots + {}_nC_nb^n$
    - **一般項**: ${}_nC_ra^{n-r}b^r$
- **多項式の割り算**
    - $A = BQ+R \quad (\text{Rの次数} < \text{Bの次数})$
- **分数式の計算**
    - $\frac{A}{B} \times \frac{C}{D} = \frac{AC}{BD}$
    - $\frac{A}{B} \div \frac{C}{D} = \frac{A}{B} \times \frac{D}{C} = \frac{AD}{BC}$
    - $\frac{A}{C} + \frac{B}{C} = \frac{A+B}{C}$
    - $\frac{A}{C} - \frac{B}{C} = \frac{A-B}{C}$

### 等式・不等式の証明
- **恒等式の性質**
    - $ax^2+bx+c = a'x^2+b'x+c' \iff a=a', b=b', c=c'$
    - $ax^2+bx+c = 0 \iff a=b=c=0$
- **相加平均と相乗平均の大小関係**
    - $\frac{a+b}{2} \ge \sqrt{ab} \quad (a>0, b>0)$
      等号成立は $a=b$ のときです。
- **相加平均と相乗平均の大小関係（3変数）**
    - $\frac{a+b+c}{3} \ge \sqrt[3]{abc} \quad (a>0, b>0, c>0)$
      等号成立は $a=b=c$ のときです。

## 複素数と方程式

### 複素数
- **虚数単位**
    - $i^2=-1$
- **負の数の平方根**
    - $\sqrt{-a} = \sqrt{a}i \quad (a>0)$
- **複素数の相等**
    - $a+bi = c+di \iff a=c \text{ かつ } b=d$

### 方程式
- **2次方程式の解の判別** (判別式 $D=b^2-4ac$)
    - $D>0 \iff$ 異なる2つの実数解
    - $D=0 \iff$ 重解
    - $D<0 \iff$ 異なる2つの虚数解
- **解と係数の関係** (2次方程式 $ax^2+bx+c=0$ の解を $\alpha, \beta$ とする)
    - $\alpha + \beta = -\frac{b}{a}$
    - $\alpha\beta = \frac{c}{a}$
- **剰余の定理**
    - 多項式 $P(x)$ を $x-k$ で割った余りは $P(k)$ です。
- **因数定理**
    - 多項式 $P(x)$ が $x-k$ を因数に持つ $\iff P(k)=0$ です。

## 図形と方程式

### 点と直線
- **2点間の距離**
    - $AB=\sqrt{(x_2-x_1)^2+(y_2-y_1)^2}$
      座標平面上の2点A, Bの間の直線距離を算出します。
- **内分点・外分点** (線分ABを m:n に分ける点)
    - **内分点**: $(\frac{nx_1+mx_2}{m+n}, \frac{ny_1+my_2}{m+n})$
    - **外分点**: $(\frac{-nx_1+mx_2}{m-n}, \frac{-ny_1+my_2}{m-n})$
- **中点**
    - $(\frac{x_1+x_2}{2}, \frac{y_1+y_2}{2})$
- **三角形の重心**
    - $(\frac{x_1+x_2+x_3}{3}, \frac{y_1+y_2+y_3}{3})$
- **直線の方程式**
    - $y-y_1 = m(x-x_1)$
      点$(x_1, y_1)$を通り、傾きがmの直線を指します。
    - $y-y_1 = \frac{y_2-y_1}{x_2-x_1}(x-x_1)$
      2点$(x_1,y_1), (x_2,y_2)$を通る直線を指します。
- **2直線の関係** (2直線 $y=m_1x+n_1, y=m_2x+n_2$ について)
    - **平行**: $m_1=m_2$
    - **垂直**: $m_1m_2 = -1$
- **点と直線の距離** (点 $(x_1,y_1)$ と直線 $ax+by+c=0$ の距離d)
    - $d = \frac{|ax_1+by_1+c|}{\sqrt{a^2+b^2}}$

### 円と領域
- **円の方程式**
    - **標準形**: $(x-a)^2 + (y-b)^2 = r^2$
      中心が(a,b)で半径がrの円を表します。
    - **一般形**: $x^2+y^2+lx+my+n=0 \quad (l^2+m^2-4n>0)$
- **円と直線の位置関係** (円の中心と直線の距離d, 半径r)
    - **2点で交わる**: $d<r$
    - **接する**: $d=r$
    - **共有点なし**: $d>r$
- **円の接線**
    - $x_1x+y_1y=r^2$
      円 $x^2+y^2=r^2$ 上の点 $(x_1, y_1)$ における接線の方程式です。
- **2つの円の位置関係** (中心間の距離d, 2円の半径r, r'　※r>r' )
    - **互いに外部にある**: $d > r+r'$
    - **外接する**: $d = r+r'$
    - **2点で交わる**: $r-r' < d < r+r'$
    - **内接する**: $d = r-r'$
    - **一方が他方の内部にある**: $d < r-r'$
- **2つの円の交点を通る直線（根軸）** <span class="tag-maniac">マニアック</span>
    - $x^2+y^2+lx+my+n=0$ と $x^2+y^2+l'x+m'y+n'=0$ が2点で交わるとき、その交点を通る直線は2つの式の差から得られます。
- **2直線の交点を通る直線** <span class="tag-maniac">マニアック</span>
    - 2つの曲線・直線 $f(x,y)=0$、$g(x,y)=0$ の交点を通る曲線は $f(x,y)+kg(x,y)=0$ の形で表されます。
- **軌跡を求める手順**
    1. 条件を満たす点の座標を(x,y)とし、条件をx,yの式で表現する。
    2. 逆に、1で得た図形上の全ての点が条件を満たすか確認する。
- **不等式の表す領域**
    - $y>mx+n \implies \text{直線の上側}$
    - $y<mx+n \implies \text{直線の下側}$
    - $x^2+y^2<r^2 \implies \text{円の内部}$
    - $x^2+y^2>r^2 \implies \text{円の外部}$

## 三角関数

### 基本性質
- **弧度法**
    - $180^\circ = \pi \text{ ラジアン}$
- **三角関数の相互関係**
    - $\tan\theta = \frac{\sin\theta}{\cos\theta}$
    - $\sin^2\theta+\cos^2\theta=1$
    - $1+\tan^2\theta=\frac{1}{\cos^2\theta}$
- **角度に関する公式**
    - $\sin(-\theta) = -\sin\theta$
    - $\cos(-\theta) = \cos\theta$
    - $\tan(-\theta) = -\tan\theta$
    - $\sin(\theta+2n\pi) = \sin\theta$
    - $\cos(\theta+2n\pi) = \cos\theta$
    - $\tan(\theta+n\pi) = \tan\theta$
- **その他の公式**:
    - $sin(\pi \pm \theta) = \mp sin\theta$
    - $cos(\pi \pm \theta) = -cos\theta$
    - $tan(\pi \pm \theta) = \pm tan\theta$
    - $sin(\frac{\pi}{2} \pm \theta) = cos\theta$
    - $cos(\frac{\pi}{2} \pm \theta) = \mp sin\theta$
    - $tan(\frac{\pi}{2} \pm \theta) = \mp \frac{1}{tan\theta}$

### 加法定理とその応用
- **加法定理**
    - $\sin(\alpha \pm \beta) = \sin\alpha \cos\beta \pm \cos\alpha \sin\beta$
    - $\cos(\alpha \pm \beta) = \cos\alpha \cos\beta \mp \sin\alpha \sin\beta$
    - $\tan(\alpha \pm \beta) = \frac{\tan\alpha \pm \tan\beta}{1 \mp \tan\alpha \tan\beta}$
- **2倍角の公式**
    - $\sin2\alpha = 2\sin\alpha \cos\alpha$
    - $\cos2\alpha = \cos^2\alpha - \sin^2\alpha = 1-2\sin^2\alpha = 2\cos^2\alpha-1$
    - $\tan2\alpha = \frac{2\tan\alpha}{1-\tan^2\alpha}$
- **半角の公式**
    - $\sin^2\frac{\alpha}{2} = \frac{1-\cos\alpha}{2}$
    - $\cos^2\frac{\alpha}{2} = \frac{1+\cos\alpha}{2}$
    - $\tan^2\frac{\alpha}{2} = \frac{1-\cos\alpha}{1+\cos\alpha}$
- **3倍角の公式**
    - $\sin3\alpha = 3\sin\alpha-4\sin^3\alpha$
    - $\cos3\alpha = 4\cos^3\alpha-3\cos\alpha$
- **積和の公式 <span class="tag-maniac">マニアック</span>**
    - $\sin A \cos B = \frac{1}{2}\\{\sin(A+B)+\sin(A-B)\\}$
    - $\cos A \sin B = \frac{1}{2}\\{\sin(A+B)-\sin(A-B)\\}$
    - $\cos A \cos B = \frac{1}{2}\\{\cos(A+B)+\cos(A-B)\\}$
    - $\sin A \sin B = -\frac{1}{2}\\{\cos(A+B)-\cos(A-B)\\}$
- **和積の公式 <span class="tag-maniac">マニアック</span>**
    - $\sin A + \sin B = 2\sin\frac{A+B}{2}\cos\frac{A-B}{2}$
    - $\sin A - \sin B = 2\cos\frac{A+B}{2}\sin\frac{A-B}{2}$
    - $\cos A + \cos B = 2\cos\frac{A+B}{2}\cos\frac{A-B}{2}$
    - $\cos A - \cos B = -2\sin\frac{A+B}{2}\sin\frac{A-B}{2}$
- **三角関数の合成**
    - $a\sin\theta+b\cos\theta = \sqrt{a^2+b^2}\sin(\theta+\alpha)$
      (ただし $\sin\alpha = \frac{b}{\sqrt{a^2+b^2}}, \cos\alpha = \frac{a}{\sqrt{a^2+b^2}}$)

## 指数関数・対数関数

### 指数
- **累乗根の性質**
    - $\sqrt[n]{a}\sqrt[n]{b} = \sqrt[n]{ab}$
    - $\frac{\sqrt[n]{a}}{\sqrt[n]{b}} = \sqrt[n]{\frac{a}{b}}$
    - $(\sqrt[n]{a})^m = \sqrt[n]{a^m}$
    - $\sqrt[m]{\sqrt[n]{a}} = \sqrt[mn]{a}$
- **有理数の指数**
    - $a^{\frac{m}{n}} = \sqrt[n]{a^m}$
    - $a^{-r} = \frac{1}{a^r}$
- **指数法則**
    - $a^r a^s = a^{r+s}$
    - $\frac{a^r}{a^s} = a^{r-s}$
    - $(a^r)^s = a^{rs}$
    - $(ab)^r = a^r b^r$
    - $(\frac{a}{b})^r = \frac{a^r}{b^r}$

### 指数・対数関数
- **指数関数 $y=a^x$ の性質**
    - $a>1$ のとき単調増加 ($p<q \iff a^p<a^q$)
    - $0<a<1$ のとき単調減少 ($p<q \iff a^p>a^q$)
- **対数の定義**
    - $a^p=M \iff p=\log_a M \quad (a>0, a\ne1, M>0)$
- **対数の性質**
    - $\log_a a = 1, \quad \log_a 1 = 0$
    - $\log_a MN = \log_a M + \log_a N$
    - $\log_a \frac{M}{N} = \log_a M - \log_a N$
    - $\log_a M^k = k \log_a M$
- **底の変換公式**
    - $\log_a b = \frac{\log_c b}{\log_c a}$
    - $\log_a b = \frac{1}{\log_b a}$
- **対数関数 $y=\log_a x$ の性質**
    - $a>1$ のとき単調増加 ($0<p<q \iff \log_a p < \log_a q$)
    - $0<a<1$ のとき単調減少 ($0<p<q \iff \log_a p > \log_a q$)
- **常用対数**
    - xの整数部分がn桁 $\iff n-1 \le \log_{10}x < n$
    - xが小数第n位に初めて0でない数字を持つ $\iff -n \le \log_{10}x < -(n-1)$
- **指数方程式・不等式**（$a>0, a\ne1$）
    - $a^x = a^p \implies x = p$
    - $a>1$ のとき $a^x < a^p \iff x < p$、$0<a<1$ のとき $a^x < a^p \iff x > p$（不等号の向きが変わります）
- **対数方程式・不等式**
    - $\log_a x = \log_a p \implies x = p$
    - $a>1$ のとき $\log_a x < \log_a p \iff 0 < x < p$、$0<a<1$ のとき $\log_a x < \log_a p \iff x > p$（真数は正）


## 微分法と積分法

### 微分法
- **微分係数** ($x=a$における)
    - $f'(a) = \lim_{h\to 0}\frac{f(a+h)-f(a)}{h}$
- **導関数**
    - $f'(x) = \lim_{h\to 0}\frac{f(x+h)-f(x)}{h}$
- **べき関数の微分**
    - $(x^n)'=nx^{n-1}, \quad (c)'=0$
- **微分の性質**
    - $\\{kf(x)+lg(x)\\}' = kf'(x)+lg'(x)$
- **接線の方程式** (曲線 $y=f(x)$ 上の点 $(a, f(a))$ における)
    - $y-f(a) = f'(a)(x-a)$
- **関数の増減**
    - $f'(x)>0 \implies$ 増加
    - $f'(x)<0 \implies$ 減少
    - $f'(x)=0 \implies$ 極値の可能性

### 積分法
- **不定積分**
    - $\int x^n dx = \frac{1}{n+1}x^{n+1}+C \quad (\text{Cは積分定数})$
- **不定積分の性質**
    - $\int\\{kf(x)+lg(x)\\}dx = k\int f(x)dx+l\int g(x)dx$
- **定積分**
    - $\int_a^b f(x)dx = [F(x)]_a^b = F(b)-F(a)$
- **定積分の性質**:
    - $\int_a^a f(x)dx = 0$
    - $\int_b^a f(x)dx = -\int_a^b f(x)dx$
    - $\int_a^c f(x)dx + \int_c^b f(x)dx = \int_a^b f(x)dx$
- **定積分と微分の関係**
    - $\frac{d}{dx}\int_a^x f(t)dt = f(x)$
- **面積を求める積分**
    - $a \le x \le b$ で $f(x) \ge g(x)$ のとき、2曲線間の面積Sは
      $S = \int_a^b \\{f(x)-g(x)\\}dx$
    - 放物線 $y=a(x-\alpha)(x-\beta)$ とx軸で囲まれた面積Sは
      $S=\frac{|a|}{6}(\beta-\alpha)^3$
- **1/12公式 <span class="tag-maniac">マニアック</span>**
    - 放物線 $y=ax^2+bx+c$ の2点 $(\alpha, f(\alpha))$, $(\beta, f(\beta))$ における2本の接線と放物線で囲まれた面積は $S=\frac{|a|}{12}(\beta-\alpha)^3$
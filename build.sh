#!/bin/sh
# app.html(아티팩트 원본) → index.html(학생용) + public/index.html(기관·시민 공개용)
cd "$(dirname "$0")"
OG_IMG="https://richee-pc.github.io/may-project/public/og.png"
page() {
  # $1 설명, $2 공개 주소, $3 body 클래스
  printf '<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n'
  printf '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
  printf '<meta name="theme-color" content="#1B2747">\n'
  printf '<meta name="description" content="%s">\n' "$1"
  printf '<meta property="og:type" content="website">\n'
  printf '<meta property="og:title" content="오월의 길과 메아리">\n'
  printf '<meta property="og:description" content="%s">\n' "$1"
  printf '<meta property="og:url" content="%s">\n' "$2"
  printf '<meta property="og:image" content="%s">\n' "$OG_IMG"
  printf '<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">\n'
  printf '<meta property="og:locale" content="ko_KR">\n'
  printf '<meta name="twitter:card" content="summary_large_image">\n'
  printf '<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}</style>\n'
  printf '</head>\n<body%s>\n' "$3"
  cat app.html
  printf '\n</body>\n</html>\n'
}
page "구전남도청 AI 정보동아리 · 무장애 지도(오월의 길)와 평화 메시지 감성 분석(오월의 메아리)" \
     "https://richee-pc.github.io/may-project/" "" > index.html
mkdir -p public
page "모두가 걸을 수 있는 5·18 사적지 무장애 지도와 방문 소감. 누구나 정보를 보태고 후기를 남길 수 있는 참여형 웹앱 · 조선대학교부속고등학교 학생 현장 조사" \
     "https://richee-pc.github.io/may-project/public/" ' class="public"' > public/index.html

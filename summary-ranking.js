const params=new URLSearchParams(location.search),next=new URLSearchParams({game:'keisanSummary'});
if(params.has('adminTest'))next.set('adminTest','');
location.replace('challenge120-ranking.html?'+next.toString());